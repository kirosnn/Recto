# Recto — Architecture du pipeline vidéo natif

> Statut : **proposition d'architecture**. Aucun code de ce document n'est encore
> écrit. Objectif : sortir des limites de « WebRTC navigateur + getDisplayMedia
> dans WebView2 » tout en **conservant le Verso web ET le Verso desktop**.

---

## 1. Pourquoi ce chantier

### 1.1 Ce qui a déjà été corrigé (stack actuelle, dans le navigateur)
- Sélection codec : H264 **matériel** (AMF/NVENC/QSV) priorisé sur AV1/H265
  software. (Avant : AV1 `libaom` software → 1 fps sous mouvement.)
- Latence récepteur : `playoutDelayHint` / `jitterBufferTarget` sur le
  `RTCRtpReceiver`.
- Maintien 1080p sous charge, bitrate de démarrage, etc.

### 1.2 Les 3 limites qu'on ne peut PAS franchir dans le navigateur
1. **Plafond de capture.** `getDisplayMedia` dans WebView2 ne délivre pas un flux
   60 fps fiable (mesuré ~22 fps sur vidéo 60 fps, `qualityLimitation=none`).
   On ne contrôle ni le mode de capture (DXGI vs GDI), ni le rythme réel.
2. **Pas de build-to-lossless.** WebRTC arrête d'émettre quand l'image est figée ;
   il ne raffine jamais une image fixe vers le quasi-sans-perte (ce que fait
   Parsec). Impossible à implémenter via l'API navigateur.
3. **Pas de contrôle fin de l'encodeur.** Pas d'accès au QP, au GOP, au mode
   low-latency de l'encodeur HW, au choix CBR/VBR/CQP. L'API
   `RTCRtpSender.setParameters` n'expose qu'un `maxBitrate` indicatif.

> Conclusion : pour un vrai niveau « Parsec », il faut **capturer et encoder en
> natif côté Recto** (Rust), et garder un transport compatible.

---

## 2. Contrainte directrice : « garder les deux Verso »

C'est LE choix qui structure toute l'archi. Conséquence directe :

- Le **transport doit rester WebRTC-compatible** (SRTP/RTP sur ICE/DTLS), parce
  qu'un navigateur ne sait recevoir de la vidéo temps réel que par WebRTC.
- Donc le Recto natif **ne peut pas** inventer son propre protocole UDP s'il veut
  parler au Verso web. Il doit produire un flux RTP H264 standard.

### 2.1 Ce que ça permet / interdit selon le pair

| Capacité | Verso **web** (navigateur) | Verso **desktop** (natif) |
|---|---|---|
| Capture native 60 fps réelle (côté Recto) | ✅ | ✅ |
| Encodeur HW piloté finement (QP/GOP/low-latency) | ✅ | ✅ |
| Décodage matériel | ✅ (navigateur) | ✅ (Media Foundation) |
| **Build-to-lossless** (raffinement écran figé) | ❌ (décodeur browser standard) | ✅ (decoder natif maison) |
| Transport | RTP/SRTP WebRTC obligatoire | RTP/SRTP **ou** protocole maison |

> **Le build-to-lossless ne sera possible que sur le chemin desktop↔desktop.**
> Le chemin desktop↔web profite quand même de la capture native + encodeur piloté
> (gros gain fps/qualité), mais reste borné par le décodeur du navigateur.

### 2.2 Décision d'architecture qui en découle
On vise **un seul transport WebRTC-compatible pour les deux**, et on ajoute *plus
tard* un canal « raffinement » optionnel actif uniquement desktop↔desktop. Ça
évite de maintenir deux piles réseau dès le départ.

---

## 3. Vue d'ensemble

```
┌──────────────────────────── RECTO (hôte, Tauri/Rust) ────────────────────────────┐
│                                                                                   │
│  [capture]            [encode]            [packetize]          [transport]        │
│  DXGI Desktop   ─▶   MediaFoundation ─▶   RTP H264      ─▶   WebRTC (str0m)        │
│  Duplication         H264 HW (AMF/          (RFC 6184)        ICE/DTLS/SRTP        │
│  (texture GPU)       NVENC/QSV)                                    │               │
│        ▲                  ▲                                        │ signaling     │
│        │ frame rate       │ QP/GOP/bitrate                         │ (Supabase,    │
│        │ contrôlé         │ pilotés                                │  inchangé)    │
│        └────── feedback (REMB/TWCC, bitrate cible) ◀───────────────┘               │
│                                                                                   │
│  Le frontend React ne fait plus le média : il pilote (start/stop/réglages) via    │
│  des commands Tauri et lit les stats. L'input reste comme aujourd'hui.            │
└───────────────────────────────────────────────────────────────────────────────────┘
                                     │  RTP/SRTP H264 sur ICE
                ┌────────────────────┴─────────────────────┐
                ▼                                            ▼
   ┌─────────────────────────┐                ┌──────────────────────────────┐
   │  VERSO WEB (navigateur) │                │  VERSO DESKTOP (Tauri/Rust)   │
   │  RTCPeerConnection      │                │  str0m → decode MF → render   │
   │  <video> (decode HW)    │                │  (+ build-to-lossless plus    │
   │  INCHANGÉ               │                │   tard, canal optionnel)      │
   └─────────────────────────┘                └──────────────────────────────┘
```

Point clé : **le Verso web ne change pas du tout.** Il reçoit un flux WebRTC H264
standard, exactement comme aujourd'hui. C'est Recto qui change de source (natif au
lieu de getDisplayMedia).

---

## 4. Découpage en modules (crates Rust)

Tout vit dans `src-tauri/`, en sous-crates pour isoler/tester (workspace Cargo).

### 4.1 `recto-capture` — capture écran
- **API Windows** : DXGI **Desktop Duplication** (`IDXGIOutputDuplication`).
  - Capture la surface du bureau en **texture GPU D3D11** (zéro copie CPU).
  - Donne le « dirty rects » / « move rects » → on sait *quand* l'image change
    (base du futur build-to-lossless et de l'économie de bitrate).
  - Gère le changement de résolution, rotation, perte d'accès (UAC, ctrl+alt+suppr).
- Sortie : `Frame { texture: ID3D11Texture2D, timestamp, dirty: bool }`.
- Fallback : Windows.Graphics.Capture (WinRT) si Desktop Duplication indisponible.
- crates candidats : `windows` (déjà présent), éventuellement `windows-capture`.

### 4.2 `recto-encode` — encodeur matériel
- **API Windows** : Media Foundation **Transform** (`IMFTransform`) avec
  l'encodeur H264 matériel, OU les SDK vendeurs (AMF / NVENC / QSV) en direct.
  - Entrée : texture D3D11 (la même que la capture → **zéro copie GPU→CPU**).
  - Sortie : NAL H264 Annex-B + infos (keyframe?, taille).
  - Réglages **qu'on contrôle enfin** : bitrate (CBR/VBR/CQP), QP min/max, GOP,
    low-latency mode, nombre de B-frames (0 pour la latence), slices.
- Détection : on a déjà `hw_encoder.rs` qui sait quel vendeur est présent.
- Démarre via **Media Foundation** (universel, marche AMF/NVENC/QSV) ; on
  spécialise plus tard si besoin de réglages avancés.

### 4.3 `recto-rtp` — packetisation
- Découpe les NAL H264 en paquets RTP (**RFC 6184** : single NAL, FU-A,
  STAP-A). C'est ce que tout navigateur sait dépaqueter.
- Gère le marquage, le timestamp 90 kHz, le SSRC.

### 4.4 `recto-transport` — WebRTC natif
- **crate : [`str0m`]** (WebRTC « sans-IO », sync, idéal pour piloter soi-même
  l'envoi des frames). Alternative : `webrtc-rs` (plus haut niveau, plus lourd).
- Rôles :
  - ICE (STUN Google, comme aujourd'hui), DTLS, SRTP.
  - Reçoit l'**offer/answer** via le signaling Supabase **existant** (on réutilise
    `signaling.ts` / le schéma `sessions` tel quel).
  - Injecte nos paquets RTP H264 sur la track vidéo.
  - Remonte le **feedback** (REMB/TWCC, NACK, PLI) → pilote le bitrate de
    `recto-encode` et déclenche les keyframes (PLI = re-keyframe).
  - Le **DataChannel input** (souris/clavier) passe par le même PeerConnection :
    on garde tout le code input actuel.

### 4.5 `recto-media` — orchestrateur + commands Tauri
- Relie capture → encode → rtp → transport dans une boucle temps réel.
- Expose des **commands Tauri** au frontend :
  `media_start(session, settings)`, `media_stop()`, `media_update_settings(...)`,
  `media_get_stats()`.
- Le frontend React devient un simple **panneau de contrôle** (plus de
  `getDisplayMedia`, plus de `RTCPeerConnection` côté Recto).

### 4.6 Côté Verso desktop (`recto-decode`, phase 3)
- Réception str0m → dépaquet RTP → decode H264 (Media Foundation) → rendu
  (D3D11 swapchain dans la fenêtre Tauri, ou texture passée à la WebView).
- C'est ici (et seulement ici) qu'on pourra ajouter le **build-to-lossless**.

---

## 5. Plan de livraison par phases (chaque phase = testable seule)

| Phase | Contenu | Critère de réussite | Risque |
|---|---|---|---|
| **0** | Workspace Cargo + squelette crates + commands Tauri vides | `tauri dev` compile et démarre | Faible |
| **1** | `recto-capture` : DXGI → dump N frames en .bmp/.raw | Frames correctes sur 1/2 écrans | Moyen |
| **2** | `recto-encode` : texture → fichier `.h264` lisible VLC | Vidéo HW fluide à la lecture | **Élevé** (MF/D3D) |
| **3** | `recto-rtp` + `recto-transport` (str0m) : flux reçu par **Verso WEB** | Le navigateur affiche l'écran natif | **Élevé** (interop) |
| **4** | Feedback BWE/PLI → bitrate/keyframe adaptatifs | Pas de freeze, s'adapte au réseau | Moyen |
| **5** | Bascule Recto : remplacer getDisplayMedia par le natif (flag) | Parité web, fps/qualité ↑ | Moyen |
| **6** | Verso **desktop** natif : decode + render | desktop↔desktop fonctionne | Élevé |
| **7** | **Build-to-lossless** (desktop↔desktop only) | Écran figé devient net | Élevé |

> Les **phases 1→2→3 sont le cœur risqué** (= le POC que je recommandais). Si la
> phase 3 marche — l'écran capturé/encodé en natif s'affiche dans le **navigateur
> Verso** — alors l'architecture entière est validée et le reste est de
> l'intégration.

---

## 6. Décisions techniques à trancher (avant de coder)

1. **Encodeur : Media Foundation (générique) vs SDK vendeur (AMF/NVENC/QSV).**
   - Reco : **Media Foundation d'abord** (un seul code pour les 3 vendeurs, marche
     sur ton AMD). SDK vendeur seulement si on a besoin de réglages que MF
     n'expose pas (rare pour H264).
2. **Transport : `str0m` (sans-IO, contrôle total) vs `webrtc-rs` (clé en main).**
   - Reco : **`str0m`** — on veut piloter précisément l'émission RTP et le timing,
     c'est exactement son cas d'usage.
3. **Rendu Verso desktop : swapchain D3D natif vs blit dans la WebView.**
   - À trancher en phase 6 seulement.
4. **Signaling : on garde Supabase tel quel.** L'offer/answer/ICE transitent par
   le schéma `sessions` actuel — **aucun changement** côté `signaling.ts` ni web.

---

## 7. Ce qui NE change pas (volontairement)

- **Signaling Supabase** (table `sessions`, codes 6 chars, RLS, realtime).
- **Verso web** : code navigateur inchangé, reçoit du H264 WebRTC standard.
- **Injection d'input** (`input.rs`, SendInput) et le DataChannel input.
- **Auth Discord, UI React, préférences.**

> On remplace **uniquement** la source vidéo de Recto (navigateur → natif) et on
> ajoute un transport WebRTC natif côté Rust. Le reste de l'app est préservé.

---

## 8. Risques & points de vigilance

- **Interop str0m ↔ navigateur** : le profil H264 négocié doit matcher ce que le
  navigateur décode en HW (packetization-mode=1, profile-level-id compatible).
  À valider tôt (phase 3).
- **Zéro-copie GPU** : si la texture capturée et l'entrée encodeur ne partagent pas
  le même device D3D11, on perd le bénéfice (copie GPU↔CPU coûteuse). À cadrer en
  phase 2.
- **Latence d'encodage** : forcer le mode low-latency (0 B-frame, GOP infini +
  keyframe sur PLI) sinon on rajoute du délai.
- **Multi-écran / DPI / HDR** : Desktop Duplication a des cas tordus (déjà géré en
  partie par `get_displays`).
- **Charge mono-PC** : tester sur 2 machines reste indispensable pour des chiffres
  représentatifs (le iGPU partagé fausse tout).

---

## 9. Prochaine étape proposée

Démarrer la **phase 0 + 1** (workspace + capture DXGI qui dump des frames),
indépendante du reste et sans toucher au code existant. C'est la fondation, faible
risque, et elle débloque la phase 2 (encodage) qui est le vrai test de faisabilité.

[`str0m`]: https://github.com/algesten/str0m
