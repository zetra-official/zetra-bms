from pathlib import Path
E=Path(__file__).resolve().parent;D=E/'production-execution'
helper=(E/'android_local_ui.py').read_text(encoding='utf-8').replace('host.exp.exponent','com.anonymous.zetrabmsclean').replace('LOCAL_EXPO_UI_NOT_VISIBLE','INSTALLED_PRODUCTION_UI_NOT_VISIBLE').replace('android-current-ui.private.xml','android-production-ui.private.xml').replace('zetra-currency-ui.xml','zetra-production-ui.xml').replace('android-live-screen.png','android-production-screen.private.png')
assert not (D/'android_production_ui.py').exists();(D/'android_production_ui.py').write_text(helper,encoding='utf-8')
runner=(E/'run_native_dashboard_acceptance.py').read_text(encoding='utf-8').replace("E=Path(__file__).resolve().parent;SERIAL=", "E=Path(__file__).resolve().parent;assert json.loads((E/'ota-network-proof.json').read_text())['status']=='PASS';SERIAL=")
runner=runner.replace('android_local_ui.py','android_production_ui.py').replace('android-current-ui.private.xml','android-production-ui.private.xml').replace('host.exp.exponent','com.anonymous.zetrabmsclean')
runner=runner.replace("adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','exp://127.0.0.1:55641','com.anonymous.zetrabmsclean')","adb('shell','am','start','-W','-n','com.anonymous.zetrabmsclean/.MainActivity')")
runner=runner.replace("E/'native_expected_values.cjs'","E.parent/'native_expected_values.cjs'").replace('android-live-screen.png','android-production-screen.private.png')
runner=runner.replace('native-dashboard-entry.png','installed-production-dashboard.png').replace('ANDROID-DASHBOARD-ACCEPTANCE.json','android-installed-ui-smoke.json')
runner=runner.replace('Actual complete local replacement app in Expo Go, Samsung SM-S938U, USB; not installed candidate OTA','Actual installed Production APK with approved OTA, Samsung SM-S938U, USB')
runner=runner.replace('release-source-android final guarded Dashboard','Installed Production app; OTA network identity and sealed bundle hash verified').replace("'otaPublication':False","'otaPublication':True").replace("'installedCandidateAcceptanceClaimed':False","'installedCandidateAcceptanceClaimed':True")
assert not (D/'run_installed_dashboard_smoke.py').exists();(D/'run_installed_dashboard_smoke.py').write_text(runner,encoding='utf-8')
print('Installed-app verification tools prepared; no device action or publication')
