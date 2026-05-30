#define MyAppName "Recto"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Recto"
#define MyAppURL "https://recto.app"
#define MyAppExeName "recto.exe"
#define MyAppProtocol "recto"
#define MyAppId "{{C6E2A1B1-D4B2-4C6E-9E8D-7F9E2A1B1C6E}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=build\installer
OutputBaseFilename=Recto-{#MyAppVersion}-Setup
SetupIconFile=src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardStyle=modern
WizardImageFile=build\installer\wizard.bmp
WizardSmallImageFile=build\installer\wizard-small.bmp
Compression=lzma2/ultra64
SolidCompression=yes
ChangesAssociations=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "src-tauri\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\installer\MicrosoftEdgeWebView2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Registry]
Root: HKCU; Subkey: "Software\Classes\{#MyAppProtocol}"; ValueType: string; ValueName: ""; ValueData: "URL:{#MyAppName} Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\{#MyAppProtocol}"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\{#MyAppProtocol}\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"",0"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\{#MyAppProtocol}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletekey

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installation de Microsoft Edge WebView2 Runtime..."; Check: not IsWebView2Installed
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\{#MyAppName}"

[Code]
function IsWebView2Installed: Boolean;
begin
  Result :=
    FileExists(ExpandConstant('{pf}\Microsoft\EdgeWebView\Application\msedgewebview2.exe')) or
    FileExists(ExpandConstant('{pf32}\Microsoft\EdgeWebView\Application\msedgewebview2.exe')) or
    FileExists(ExpandConstant('{localappdata}\Microsoft\EdgeWebView\Application\msedgewebview2.exe'));
end;
