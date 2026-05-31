# Native streaming worklog

## Objectif

Construire un pipeline natif de streaming bureau pour viser un niveau proche de Parsec :

- resolution native, avec 1080p minimum si l'ecran le permet ;
- 50 a 60 fps constants ;
- bonne qualite visuelle sur mouvement ;
- audio systeme capture proprement et compresse en Opus ;
- chemin GPU autant que possible, sans retour CPU pour la video.

## Modifications video

### Capture et cadence

- Validation de Desktop Duplication comme source video native.
- Conservation d'une texture GPU possedee par le pipeline pour pouvoir re-encoder la derniere image meme si le bureau ne publie pas de nouvelle frame.
- Passage du probe video a une cadence fixe 60 Hz.
- Correction de la texture cache D3D11 : les flags Desktop Duplication ne sont pas reutilisables tels quels pour le video processor. La texture cache est maintenant une texture simple, usage default, sans bind flags parasites.

### Conversion couleur

- Extension du convertisseur BGRA vers NV12 pour utiliser un pool de textures NV12 au lieu d'une texture unique.
- Ajout d'une conversion `convert_into` indexee pour eviter de reutiliser trop vite une surface encore en vol.
- Ajout de diagnostics de temps passes dans la conversion, l'entree encodeur et le drain.

### Media Foundation

- Ajout de backpressure et de surfaces en vol pour mieux respecter le fonctionnement asynchrone du MFT.
- Ajout de `dropped_frames` pour mesurer les pertes encodeur.
- Ajout du pompage d'evenements MFT dans `drain`.
- Correction de la boucle de `ProcessOutput`, qui pouvait declencher `0x8000FFFF`.
- Ajout de reglages bas-latence : pas de B-frames, mode temps reel, profil H264, bitrate controle.

Resultat : le flux est devenu valide, avec environ un paquet H264 par frame, mais l'encodeur AMD via Media Foundation est reste bloque autour de 31 a 35 fps.

### AMF direct

- Ajout de `amffi`.
- Ajout de `AmfDirectEncoder` pour AMD.
- Initialisation AMF via le device D3D11 de capture.
- Conversion BGRA vers NV12 sur GPU, puis copie vers une surface AMF DX11.
- Routage AMD vers AMF direct, avec fallback Media Foundation si l'initialisation AMF echoue.
- Ajout du probe `amf_probe` pour isoler l'encodeur AMF avec des frames synthetiques.

Resultat : AMF direct a permis de passer le probe reel en 1080p de 32 fps environ a 59.9-60.0 fps.

### Politique resolution et bitrate

- Ajout de `EncoderConfig::for_desktop`.
- La resolution encodee suit la resolution reelle de l'ecran.
- Si l'ecran est au moins 1920x1080, la config refuse une sortie sous 1080p.
- La cadence cible est 60 fps.
- Le bitrate video cible est maintenant calcule par resolution avec une marge qualite plus elevee :
  - 1080p60 : environ 45 Mbps ;
  - resolution superieure : bitrate proportionnel aux pixels, plafonne a 180 Mbps ;
  - plancher : 35 Mbps.
- Ajout cote AMF de `PeakBitrate`, `VBVBufferSize`, `HighMotionQualityBoostEnable` et `MaxQP` pour laisser plus de marge sur mouvement et eviter une quantification trop agressive.

## Modifications audio

- Ajout de `src-tauri/src/audio.rs`.
- Capture du rendu systeme via WASAPI loopback.
- Lecture du mix format Windows.
- Support PCM float 32-bit, PCM 16-bit, PCM 24-bit et PCM 32-bit.
- Conversion vers stereo float.
- Resampling lineaire vers 48 kHz si necessaire.
- Encodage Opus en stereo, frames 10 ms, cible 160 kbps.
- Ajout de `audio_probe` qui ecrit des paquets Opus bruts avec timestamp et taille.
- Utilisation de `opus-head-sys` vendored pour eviter une dependance locale a `libclang`.
- Ajout d'une capture PCM float continue dans `encode_probe` pour produire un fichier de validation lisible par les lecteurs.
- Ajout d'un mux final `ffmpeg` dans `encode_probe` :
  - `native_capture.h264` reste le flux video brut ;
  - `native_audio.f32` reste le flux audio PCM brut de debug ;
  - `native_capture.mkv` contient H264 + Opus et doit etre ouvert avec `ffplay`.
- Ajout d'un remplissage silence lorsque WASAPI loopback ne livre pas de buffers continus, afin que la piste audio couvre toute la duree du probe.

Validation audio :

- entree WASAPI testee : 48000 Hz, 2 canaux ;
- sortie Opus : 48 kHz stereo ;
- probe 10 s : environ 1002 paquets ;
- bitrate effectif mesure : environ 161 kbps.

## Essais sans succes ou rejetes

### Media Foundation seul sur AMD

Media Foundation a ete stabilise, mais n'a pas atteint l'objectif. Meme apres :

- surface pool ;
- drain asynchrone ;
- reglages low latency ;
- baisse du bitrate ;
- test en 720p ;
- suppression des B-frames ;
- modes CBR, LowDelayVBR et PeakConstrainedVBR ;

le chemin AMD via MFT est reste autour de 31 a 35 fps, avec beaucoup de temps perdu dans les evenements MFT. La capture et la conversion GPU n'etaient pas le goulot.

### Preset AMF HighQualityCbr

Le preset AMF `HighQualityCbr` a ete teste pour ameliorer la qualite. Sur l'APU AMD testee, il a fait chuter le probe a environ 6 fps et a provoque un crash a la fermeture. Il a donc ete retire.

Le compromis conserve est :

- usage AMF ultra-low-latency pour garder 60 fps ;
- preset quality ;
- bitrate cible plus haut ;
- peak bitrate plus haut ;
- limite QP pour eviter une image trop degradee.

### Texture Desktop Duplication reutilisee directement

Reutiliser directement la texture fournie par Desktop Duplication apres un nouvel `acquire` n'est pas fiable : la texture appartient au duplicator et sa validite depend du cycle DXGI. Cela a produit des erreurs `E_INVALIDARG`.

La solution retenue est une texture cache possedee par le pipeline.

### Texture cache avec flags incorrects

La premiere texture cache reutilisait trop de description de la texture source. Le video processor D3D11 refusait ensuite la conversion BGRA vers NV12 avec `0x80070057`.

La correction a ete de creer une texture cache propre, sans bind flags ni misc flags parasites.

### Binding Opus `shiguredo_opus`

Le binding `shiguredo_opus` a ete teste avec `source-build`.

Problemes rencontres :

- premier blocage : `llvm-nm` absent ;
- apres ajout de `llvm-tools`, nouveau blocage : `libclang` absent.

Ce chemin a ete abandonne pour eviter d'imposer LLVM/Clang sur la machine de build. `opus-head-sys` a ete retenu a la place.

## Resultats valides

### Video

Commande :

```powershell
cargo run --example encode_probe --manifest-path src-tauri/Cargo.toml
```

Resultat valide apres la hausse de bitrate :

- bureau : 1920x1080 ;
- cible : 1920x1080 a 60 fps, 44.8 Mbps ;
- frames soumises : 600 ;
- fps : 59.9 ;
- frames droppees : 0 ;
- paquets H264 : 599 ;
- bitrate effectif : 44.7 Mbps.

### Audio

Commande :

```powershell
cargo run --example audio_probe --manifest-path src-tauri/Cargo.toml
```

Resultat :

- entree WASAPI : 48000 Hz, 2 canaux ;
- paquets Opus : 1002 ;
- bitrate effectif : 161.2 kbps ;
- duree : 10.0 s.

### Lecture audio/video locale

`native_capture.h264` ne contient que la video. Pour tester le son, il faut ouvrir le conteneur muxe :

```powershell
ffplay native_capture.mkv
```

Validation du conteneur :

- stream video : H264 ;
- stream audio : Opus ;
- duree conteneur : environ 10.0 s.

## Points restants

- Integrer la packetisation reseau video/audio dans le transport final.
- Ajouter une adaptation dynamique du bitrate selon reseau et charge GPU.
- Ajouter un feedback recepteur pour demander des keyframes.
- Tester sur NVIDIA et Intel, actuellement servis par le fallback Media Foundation.
- Tester sur ecrans 1440p et 4K pour confirmer les nouveaux plafonds de bitrate.
