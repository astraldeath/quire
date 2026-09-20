; Register an available handler without changing extension defaults or UserChoice.
; Tauri's APP_ASSOCIATE macro sets extension defaults, so use OpenWithProgids.
!macro QuireRegisterExtension EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "app.quire.reader.${EXT}" ""
  WriteRegStr SHCTX "Software\Classes\app.quire.reader.${EXT}" "" "Quire ${EXT} book"
  WriteRegStr SHCTX "Software\Classes\app.quire.reader.${EXT}\DefaultIcon" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0'
  WriteRegStr SHCTX "Software\Classes\app.quire.reader.${EXT}\shell\open\command" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"'
  WriteRegStr SHCTX "Software\Quire\Capabilities\FileAssociations" ".${EXT}" "app.quire.reader.${EXT}"
!macroend

!macro QuireUnregisterExtension EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "app.quire.reader.${EXT}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
  DeleteRegKey SHCTX "Software\Classes\app.quire.reader.${EXT}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Quire\Capabilities" "ApplicationName" "Quire"
  WriteRegStr SHCTX "Software\Quire\Capabilities" "ApplicationDescription" "Read books with Quire"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Quire" "Software\Quire\Capabilities"
  !insertmacro QuireRegisterExtension "epub"
  !insertmacro QuireRegisterExtension "cbz"
  !insertmacro QuireRegisterExtension "cbr"
  !insertmacro QuireRegisterExtension "cb7"
  !insertmacro QuireRegisterExtension "fb2"
  !insertmacro QuireRegisterExtension "fbz"
  !insertmacro QuireRegisterExtension "mobi"
  !insertmacro QuireRegisterExtension "azw3"
  !insertmacro QuireRegisterExtension "pdf"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro QuireUnregisterExtension "epub"
  !insertmacro QuireUnregisterExtension "cbz"
  !insertmacro QuireUnregisterExtension "cbr"
  !insertmacro QuireUnregisterExtension "cb7"
  !insertmacro QuireUnregisterExtension "fb2"
  !insertmacro QuireUnregisterExtension "fbz"
  !insertmacro QuireUnregisterExtension "mobi"
  !insertmacro QuireUnregisterExtension "azw3"
  !insertmacro QuireUnregisterExtension "pdf"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Quire"
  DeleteRegKey SHCTX "Software\Quire\Capabilities"
  DeleteRegKey /ifempty SHCTX "Software\Quire"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
