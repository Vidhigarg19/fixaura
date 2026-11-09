# V09 i18n coverage (EN / HI)

Generated from the V09 audit scripts on branch `vidhi/v09-hindi-a11y`. The scripts were temporary and have been deleted.

## Key counts

| Measure | Before | After |
| --- | --- | --- |
| Source files scanned | 84 | 87 |
| English leaf keys | 589 | 616 |
| Hindi leaf keys | 589 | 616 |
| Literal keys used in code | 405 | 430 |
| Dynamic key templates checked | 12 | 17 |

## Scan results

| Check | Before | After |
| --- | --- | --- |
| Keys used in code but missing in EN |  |  |
| Keys used in code but missing in HI |  |  |
| Keys only in EN (deep parity) |  |  |
| Keys only in HI (deep parity) |  |  |
| Placeholder mismatches ({name}) |  |  |
| Empty values (EN / HI) | 2 / 2 | 2 / 2 |
| Hindi identical to English | [object Object],[object Object],[object Object],[object Object],[object Object],[object Object] | [object Object],[object Object],[object Object],[object Object],[object Object],[object Object] |
| Hindi values containing English words | [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object] | [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object] |
| Hardcoded user-facing strings found by scan | 68 | 61 |

Hardcoded strings that were user-facing and are now translated: all of `DiagnosisHistory.tsx`, the Diagnosis save status, raw auth/sign-out/progress/completion error text, and the voice-unsupported message. What the scan still reports is listed under exceptions.

## Intentional exceptions

Hindi equal to English (reviewed by a human, not changed):

- `landing.headline`, `landing.heroLine1`, `landing.heroLine2`, `landing.footerTagline`, `landing.footerSurgicalTagline`: the brand tagline "Your home our intelligence". The logo carries the same English tagline. Please decide whether it should be translated.
- `auth.emailPlaceholder`: `you@example.com` is an example address.

Empty values: `completion.shareMiddle` and `completion.shareSuffix` are empty on purpose in both languages (the share text is built from the prefix only).

Technical words kept in English inside Hindi sentences: HTTPS, localhost, Supabase, Overpass, Enter, Shift, AR, and the brand name HomeGenie. The number 112 is kept as is.

Hardcoded strings left on purpose:

- Developer-only errors thrown by `src/services/*` (historyService, mediaService, repairSessionDb, photoImage, visionAI) and by `Diagnosis.tsx` save steps. They are logged, and the screen shows a translated message instead (`localizedErrorMessage` shows only text that is already a translated key, otherwise a fallback key).
- Context guards `useAssistant`, `useAuth` (thrown on programmer error).
- Files V09 was not allowed to edit: `src/App.tsx` (the "HomeGenie" loading text and the session-check page), `src/components/AuthProvider.tsx`, `src/services/visionAI.ts`, `src/lib/supabase.ts`.
- `src/components/CameraDiagnostics.tsx`: not used by any route (developer tool).
- `index.html` static `<title>`: the document language is set at runtime, the title stays "HomeGenie | Your home our intelligence".
- Text stored in the database or returned by the AI (issue titles, summaries, recommended fixes) is shown as stored.
- False positives of the scan: the `Promise` generic text in two files, a comparison expression in `NearbyShops.tsx`, and the status codes `saving` / `saved` / `failed` that are now translated through `diagnosis.saveStatus.*`.

## Hindi safety and error strings (full list)

Every key whose name relates to safety, risk, errors, deletion, confirmation, offline, unavailable, emergency, professional, hazard, danger, warning or caution. Review these with a native speaker before release.

Total: 151 (was 142).

| Key | English | Hindi |
| --- | --- | --- |
| `diagnosisHistory.loadError` | We couldn't load your diagnosis history. | निदान इतिहास लोड नहीं हो सका। |
| `diagnosisHistory.risk` | Risk | जोखिम |
| `nav.signOutError` | We couldn't sign you out. Please try again. | साइन आउट नहीं हो सका। कृपया फिर कोशिश करें। |
| `nearby.errorBusy` | The directory service is busy right now. Wait a minute and try again, or search in Google Maps. | निर्देशिका सेवा अभी व्यस्त है। थोड़ी देर बाद फिर कोशिश करें या Google Maps में खोजें। |
| `nearby.errorTimeout` | The directory service took too long to answer. Try again, or search in Google Maps. | निर्देशिका सेवा ने समय पर जवाब नहीं दिया। फिर कोशिश करें या Google Maps में खोजें। |
| `nearby.locationUnavailable` | Your current location could not be determined. | आपकी मौजूदा लोकेशन निर्धारित नहीं हो सकी। |
| `nearby.overpassUnavailable` | The nearby directory is temporarily unavailable. Please try again or search in Google Maps. | आस-पास की निर्देशिका अभी उपलब्ध नहीं है। फिर कोशिश करें या Google Maps में खोजें। |
| `nearby.internetUnavailable` | You appear to be offline. Check your internet connection and try again. | आप ऑफ़लाइन दिखाई दे रहे हैं। इंटरनेट जाँचकर फिर कोशिश करें। |
| `landing.why.safety.tag` | Safety first | सुरक्षा प्रथम |
| `landing.why.safety.title` | Safety-First Guidance | सुरक्षा-प्रथम मार्गदर्शन |
| `landing.why.safety.description` | Critical repair steps are gated behind confirmation checks, hazard alerts, and professional disclaimers so you never take unsafe risks. | महत्वपूर्ण मरम्मत चरण सुरक्षा पुष्टिकरण, बिजली बंद करने की जाँच और स्पष्ट पेशेवर जोखिम चेतावनियों से सुरक्षित हैं। |
| `landing.feature.safetyGuidance.title` | Safety-first guidance | सुरक्षा-पहले मार्गदर्शन |
| `landing.feature.safetyGuidance.description` | Critical steps are gated behind confirmation prompts so users never skip safety checks. | महत्वपूर्ण चरणों को पुष्टि प्रॉम्प्ट के साथ सुरक्षित रखा जाता है ताकि आप सुरक्षा चेक्स स्किप न करें। |
| `landing.preview.safetyLine` | Repair is safe to continue after shutoff confirmation. | शटऑफ की पुष्टि के बाद मरम्मत जारी रखना सुरक्षित है। |
| `capture.errorTitle` | Camera unavailable | कैमरा उपलब्ध नहीं |
| `capture.errorBody` | We couldn't access your camera. Check permissions or try another device. | कैमरा एक्सेस नहीं हो सका। अनुमति जाँचें या दूसा डिवाइस आज़माएँ। |
| `capture.cameraSecurityError` | The browser blocked camera access for security reasons. Use localhost or HTTPS, then retry. | सुरक्षा कारणों से ब्राउज़र ने कैमरा एक्सेस रोक दिया। localhost या HTTPS का उपयोग करके फिर कोशिश करें। |
| `capture.cameraUnknownError` | The camera could not be started. Retry or upload a photo. | कैमरा शुरू नहीं हो सका। फिर कोशिश करें या फोटो अपलोड करें। |
| `capture.cameraPlaybackError` | The camera opened, but its preview could not be played. Retry or upload a photo. | कैमरा खुला, लेकिन उसका पूर्वावलोकन नहीं चल सका। फिर कोशिश करें या फोटो अपलोड करें। |
| `capture.photoProcessingError` | We couldn't process that photo. Please try another image. | फोटो प्रोसेस नहीं हो सकी। कृपया दूसरी फोटो आज़माएं। |
| `capture.analysisError` | AI analysis failed. Check your connection and try again. | AI विश्लेषण विफल हुआ। अपना कनेक्शन जाँचें और फिर कोशिश करें। |
| `capture.analysisErrorTitle` | We couldn't analyze your photo | हम आपकी फ़ोटो का विश्लेषण नहीं कर सके |
| `capture.analysisErrorOffline` | You seem to be offline. Check your connection and try again. | लगता है आप ऑफ़लाइन हैं। अपना कनेक्शन जाँचें और फिर कोशिश करें। |
| `capture.analysisErrorUnauthenticated` | Please log in again to analyze a photo. | फ़ोटो का विश्लेषण करने के लिए कृपया फिर से लॉग इन करें। |
| `capture.analysisErrorInvalidInput` | Please check your photo and description, then try again. | कृपया अपनी फ़ोटो और विवरण जाँचें, फिर दोबारा कोशिश करें। |
| `capture.analysisErrorBusy` | The analysis service is busy right now. Please try again in a few minutes. | विश्लेषण सेवा अभी व्यस्त है। कृपया कुछ मिनट बाद फिर कोशिश करें। |
| `capture.analysisErrorUnavailable` | The analysis service isn't available right now. Your photo and description are still here, so you can try again. | विश्लेषण सेवा अभी उपलब्ध नहीं है। आपकी फ़ोटो और विवरण यहीं हैं, इसलिए आप फिर कोशिश कर सकते हैं। |
| `capture.voicePermissionError` | Microphone permission was denied. Allow microphone access in your browser settings and try again. | माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र सेटिंग में अनुमति दें और फिर कोशिश करें। |
| `capture.voiceNoSpeechError` | No speech was detected. Please try speaking again. | कोई आवाज़ नहीं मिली। कृपया फिर बोलें। |
| `capture.voiceNetworkError` | Voice input failed because of a network or microphone error. Please try again. | नेटवर्क या माइक्रोफ़ोन की समस्या से आवाज़ इनपुट विफल हुआ। कृपया फिर कोशिश करें। |
| `diagnosis.riskLevel` | Risk level | जोखिम स्तर |
| `diagnosis.riskLow` | Low risk | कम जोखिम |
| `diagnosis.riskMedium` | Medium risk | मध्यम जोखिम |
| `diagnosis.riskHigh` | High risk | उच्च जोखिम |
| `diagnosis.riskSafe` | Lower risk | कम जोखिम |
| `diagnosis.riskCaution` | Take care | सावधानी रखें |
| `diagnosis.riskProfessional` | Needs a professional | पेशेवर की ज़रूरत है |
| `diagnosis.riskEmergency` | Emergency | आपातकाल |
| `diagnosis.riskSafeBody` | Nothing in the analysis points to serious danger. Still follow every safety note. | विश्लेषण में किसी गंभीर खतरे का संकेत नहीं मिला। फिर भी हर सुरक्षा नोट का पालन करें। |
| `diagnosis.riskCautionBody` | There is some risk. Switch off power or water first and follow each safety note. | कुछ जोखिम है। पहले बिजली या पानी बंद करें और हर सुरक्षा नोट का पालन करें। |
| `diagnosis.riskBlockedBody` | HomeGenie is not showing repair steps for this. See the safety notice above. | HomeGenie इसके लिए मरम्मत के चरण नहीं दिखा रहा है। ऊपर दी गई सुरक्षा सूचना देखें। |
| `auth.errorInvalidCredentials` | The email or password is not correct. | ईमेल या पासवर्ड सही नहीं है। |
| `auth.errorEmailNotConfirmed` | Please confirm your email first. Check your inbox. | पहले अपने ईमेल की पुष्टि करें। अपना इनबॉक्स देखें। |
| `auth.errorUserExists` | An account with this email already exists. Try logging in. | इस ईमेल से खाता पहले से बना है। लॉग इन करके देखें। |
| `auth.errorWeakPassword` | Choose a stronger password with at least 6 characters. | कम-से-कम 6 अक्षर का मज़बूत पासवर्ड चुनें। |
| `auth.errorRateLimit` | Too many attempts. Wait a few minutes and try again. | बहुत ज़्यादा कोशिशें हो चुकी हैं। कुछ मिनट रुककर फिर कोशिश करें। |
| `auth.errorGeneric` | We couldn't sign you in. Check your details and try again. | साइन इन नहीं हो सका। अपनी जानकारी जाँचें और फिर कोशिश करें। |
| `auth.confirmEmail` | Check your email to confirm your account. After confirmation, you can continue to your requested page. | खाते की पुष्टि के लिए अपना ईमेल देखें। पुष्टि के बाद आप अपने अनुरोधित पेज पर जा सकेंगे। |
| `guide.confirmStep` | I've completed this step | मैंने यह कदम पूरा किया |
| `guide.safetyConfirm` | Confirm safety | सुरक्षा की पुष्टि |
| `guide.progressSaveError` | Could not save this step. Check your connection and try again. | यह कदम सेव नहीं हो सका। अपना कनेक्शन जाँचें और फिर कोशिश करें। |
| `guide.progressSessionUnavailable` | This repair session is unavailable to your account. Return to diagnosis and try again. | यह मरम्मत सत्र आपके खाते के लिए उपलब्ध नहीं है। निदान पर लौटें और फिर कोशिश करें। |
| `guide.unavailableTitle` | Guided repair is not available for this result yet. | इस नतीजे के लिए निर्देशित मरम्मत अभी उपलब्ध नहीं है। |
| `guide.unavailableBody` | No approved checklist or step-by-step guide is available. | कोई स्वीकृत चेकलिस्ट या कदम-दर-कदम गाइड उपलब्ध नहीं है। |
| `guide.unavailableUnsupported` | This object does not have a reviewed repair guide, so we won't show generic steps that may be unsafe for it. | इस वस्तु के लिए समीक्षित मरम्मत गाइड नहीं है, इसलिए हम ऐसे सामान्य कदम नहीं दिखाएँगे जो इसके लिए असुरक्षित हो सकते हैं। |
| `guide.unavailableStale` | The repair guide for this result has not been reviewed against the current safety policy, so it is not available. | इस नतीजे की मरम्मत गाइड की मौजूदा सुरक्षा नीति के अनुसार समीक्षा नहीं हुई है, इसलिए यह उपलब्ध नहीं है। |
| `completion.savingsUnavailable` | Estimated financial savings are unavailable because no verified cost comparison was recorded. | अनुमानित वित्तीय बचत उपलब्ध नहीं है क्योंकि कोई सत्यापित लागत तुलना दर्ज नहीं की गई थी। |
| `completion.sessionUnavailable` | This repair session or diagnosis could not be verified for your account. | आपके खाते के लिए मरम्मत सत्र या निदान सत्यापित नहीं हो सका। |
| `completion.saveError` | Could not save that the steps are finished. Check your connection and retry. | यह सेव नहीं हो सका कि चरण पूरे हुए। कनेक्शन जाँचें और फिर कोशिश करें। |
| `common.error` | Something went wrong | कुछ गलत हो गया |
| `common.confirm` | Confirm | पुष्टि |
| `errorBoundary.title` | Something went wrong | कुछ गलत हो गया |
| `errorBoundary.body` | This page ran into an unexpected problem. You can try loading it again or return to the home page. | इस पेज में एक अप्रत्याशित समस्या आई। आप इसे फिर से लोड करने की कोशिश कर सकते हैं या होम पेज पर लौट सकते हैं। |
| `errorBoundary.tryAgain` | Try again | फिर कोशिश करें |
| `errorBoundary.goHome` | Go home | होम पर जाएँ |
| `safety.powerOff` | Turn off power at the breaker before continuing. | जारी रखने से पहले ब्रेकर से बिजली बंद करें। |
| `safety.waterShutoff` | Shut off water supply before disassembly. | खोलने से पहले पानी की आपूर्ति बंद करें। |
| `safety.gloves` | Wear protective gloves for this step. | इस कदम के लिए सुरक्षा दस्ताने पहनें। |
| `safety.genericTitle` | Safety check | सुरक्षा जाँच |
| `safety.genericConfirm` | I understand — continue | मैं समझ गया/गई — जारी |
| `safetyPolicy.title` | Safety notice | सुरक्षा सूचना |
| `safetyPolicy.aiDisclaimer` | This is AI-generated guidance and may be wrong. Check your situation and stop if anything seems unsafe. | यह AI से बना मार्गदर्शन है और गलत हो सकता है। अपनी स्थिति जाँचें और असुरक्षित लगे तो रुक जाएँ। |
| `safetyPolicy.disclaimer.generic` | Work carefully, use the right protective gear, and stop if you are unsure. | सावधानी से काम करें, सही सुरक्षा उपकरण पहनें, और संदेह हो तो रुक जाएँ। |
| `safetyPolicy.disclaimer.gas` | Anything involving gas carries a serious risk. If you smell gas, leave the area, do not use switches or flames, and call a professional. | गैस से जुड़ा कोई भी काम गंभीर जोखिम रखता है। गैस की गंध आए तो जगह छोड़ दें, स्विच या आग का उपयोग न करें, और पेशेवर को बुलाएँ। |
| `safetyPolicy.disclaimer.electrical` | Electrical work can cause shock or fire. Switch off power at the breaker and confirm it is off before touching anything. | बिजली का काम झटका या आग का कारण बन सकता है। ब्रेकर से बिजली बंद करें और छूने से पहले पुष्टि करें कि वह बंद है। |
| `safetyPolicy.disclaimer.fire` | Signs of fire, smoke, or burning need immediate attention. Keep away and call emergency services if there is any danger. | आग, धुआँ या जलने के संकेत पर तुरंत ध्यान दें। दूर रहें और खतरा हो तो आपातकालीन सेवाओं को बुलाएँ। |
| `safetyPolicy.disclaimer.structural` | Structural work can be unsafe and may need a permit. Have a qualified professional assess it before you proceed. | ढाँचे का काम असुरक्षित हो सकता है और अनुमति की ज़रूरत पड़ सकती है। आगे बढ़ने से पहले किसी योग्य पेशेवर से जाँच कराएँ। |
| `safetyPolicy.disclaimer.chemical` | Handle chemicals and refrigerants with care in a ventilated space, and never mix cleaning products. | रसायनों और रेफ्रिजरेंट को हवादार जगह में सावधानी से संभालें, और सफाई उत्पादों को कभी न मिलाएँ। |
| `safetyPolicy.disclaimer.medical` | If someone is hurt or unwell, stop and get medical help first. Call emergency services (112) if it is serious. | कोई घायल या अस्वस्थ हो तो पहले रुकें और चिकित्सा सहायता लें। गंभीर हो तो आपातकालीन सेवाओं (112) को कॉल करें। |
| `safetyPolicy.disclaimer.policy` | HomeGenie will not help bypass or disable safety protections. Please keep safety devices in place. | HomeGenie सुरक्षा सुरक्षाओं को बायपास या बंद करने में मदद नहीं करेगा। कृपया सुरक्षा उपकरण यथावत रखें। |
| `fallback.title` | We're not fully confident | हम पूरी तरह आश्वस्त नहीं |
| `fallback.body` | The image may be unclear or the issue unusual. Retake a well-lit photo, or continue with caution. | छवि अस्पष्ट हो सकती है। अच्छी रोशनी में फोटो लें, या सावधानी से जारी रखें। |
| `fallback.retake` | Retake photo | फोटो दोबारा |
| `fallback.continueCaution` | Continue with caution | सावधानी से जारी |
| `history.delete` | Delete | हटाएँ |
| `history.confirmDelete` | Delete this repair and its messages? | यह मरम्मत और इसके संदेश हटाएँ? |
| `history.loadError` | We couldn't load your repair history. | मरम्मत इतिहास लोड नहीं हो सका। |
| `history.messageCountWarning` | Message counts are temporarily unavailable. | संदेशों की संख्या अभी उपलब्ध नहीं है। |
| `history.deleteError` | We couldn't delete this repair. | यह मरम्मत हटाई नहीं जा सकी। |
| `history.progressError` | We couldn't save your repair progress. | मरम्मत की प्रगति सहेजी नहीं जा सकी। |
| `history.chatError` | We couldn't load or save the repair chat. | मरम्मत की बातचीत लोड या सहेजी नहीं जा सकी। |
| `history.saveError` | We couldn't save your repair. | मरम्मत सहेजी नहीं जा सकी। |
| `history.deleteDialogTitle` | Delete this repair? | यह मरम्मत हटाएँ? |
| `history.deleteDialogBody` | This deletes the repair and its chat. You cannot undo this. | इससे यह मरम्मत और इसकी चैट हट जाएगी। इसे वापस नहीं किया जा सकता। |
| `history.deleted` | The repair was deleted. | मरम्मत हटा दी गई। |
| `history.deleteOffline` | You are offline. Connect to the internet to delete this repair. | आप ऑफ़लाइन हैं। यह मरम्मत हटाने के लिए इंटरनेट से जुड़ें। |
| `history.offlineTitle` | You are offline | आप ऑफ़लाइन हैं |
| `history.offlineBody` | Connect to the internet to see your repair history. We will try again when you are back online. | अपनी मरम्मत हिस्ट्री देखने के लिए इंटरनेट से जुड़ें। ऑनलाइन होते ही हम फिर से कोशिश करेंगे। |
| `assistant.persistenceWarning` | This chat couldn't be saved or loaded. You can keep chatting here. | यह बातचीत लोड या सेव नहीं हो सकी। आप यहाँ बातचीत जारी रख सकते हैं। |
| `assistant.chips.general.safety` | Is it safe to do this myself? | क्या इसे खुद करना सुरक्षित है? |
| `assistant.reply.hazard` | Stop work now. Do not touch the appliance, wiring, water, or controls. If you can make the area safe without approaching or touching the hazard, do so; otherwise move away and keep others clear. Call a qualified professional or local emergency service. Do not attempt a DIY repair. | अभी काम रोक दें। उपकरण, तारों, पानी या नियंत्रणों को न छुएँ। यदि खतरे के पास जाए या उसे छुए बिना जगह को सुरक्षित करना संभव हो, तो ऐसा करें; अन्यथा वहाँ से दूर जाएँ और दूसरों को भी दूर रखें। किसी योग्य पेशेवर या स्थानीय आपातकालीन सेवा को कॉल करें। स्वयं मरम्मत करने की कोशिश न करें। |
| `verify.status.professional` | Have a qualified professional check it | किसी योग्य पेशेवर से जाँच करवाएँ |
| `verify.safetyMessage` | A qualified professional should check this. Do not attempt further repairs yourself. If you can do it without risk, switch off the power or the main supply. | किसी योग्य पेशेवर को इसकी जाँच करनी चाहिए। आगे खुद मरम्मत की कोशिश न करें। अगर आप बिना जोखिम के कर सकें, तो बिजली या मुख्य आपूर्ति बंद कर दें। |
| `verify.error` | The comparison could not be completed. | तुलना पूरी नहीं हो सकी। |
| `verify.unavailable` | Photo comparison is not available yet. No comparison result has been recorded. | फ़ोटो तुलना अभी उपलब्ध नहीं है। तुलना का कोई नतीजा दर्ज नहीं हुआ है। |
| `verify.observation.needs_professional` | Have a qualified professional check it | किसी योग्य पेशेवर से जाँच करवाएँ |
| `verify.errorPanel.title` | Comparison did not run | तुलना नहीं हुई |
| `verify.errorPanel.offline` | You are offline. Connect to the internet and try again. | आप ऑफ़लाइन हैं। इंटरनेट से जुड़ें और फिर कोशिश करें। |
| `verify.errorPanel.unavailable` | Photo comparison is not available yet. Nothing was sent and no result was recorded. | फ़ोटो तुलना अभी उपलब्ध नहीं है। कुछ भी भेजा नहीं गया और कोई नतीजा दर्ज नहीं हुआ। |
| `verify.errorPanel.invalid_response` | The comparison returned a result that could not be used. No result was recorded. | तुलना से ऐसा नतीजा मिला जिसका उपयोग नहीं हो सकता। कोई नतीजा दर्ज नहीं हुआ। |
| `verify.errorPanel.failed` | The comparison could not be completed. No result was recorded. | तुलना पूरी नहीं हो सकी। कोई नतीजा दर्ज नहीं हुआ। |
| `observe.disclaimer` | This is only a visual observation of your photos. It does not confirm the repair is safe or complete. | यह केवल आपके फ़ोटो का दृश्य अवलोकन है। यह पुष्टि नहीं करता कि मरम्मत सुरक्षित या पूरी है। |
| `observe.warningsTitle` | Important cautions | ज़रूरी सावधानियाँ |
| `observe.safetyOverride` | A possible hazard means this cannot be treated as safe, no matter how it looks. Have a qualified professional check it. | संभावित खतरे का मतलब है कि इसे सुरक्षित नहीं माना जा सकता, चाहे यह कैसा भी दिखे। किसी योग्य पेशेवर से जाँच कराएँ। |
| `observe.status.professional_review` | A professional should check this | किसी पेशेवर को इसे जाँचना चाहिए |
| `observe.statusBody.professional_review` | Because of a possible hazard, a qualified professional should assess this before it is used. | संभावित खतरे के कारण, उपयोग से पहले किसी योग्य पेशेवर को इसका आकलन करना चाहिए। |
| `blocked.titleProfessional` | Please don't repair this yourself | कृपया इसे खुद ठीक न करें |
| `blocked.titleEmergency` | This may be dangerous right now | यह अभी खतरनाक हो सकता है |
| `blocked.whyProfessional` | This looks too risky to repair at home. HomeGenie will not show repair steps for it. Please contact a qualified professional. | यह घर पर ठीक करने के लिए बहुत जोखिम भरा लगता है। HomeGenie इसके लिए मरम्मत के चरण नहीं दिखाएगा। कृपया किसी योग्य पेशेवर से संपर्क करें। |
| `blocked.whyEmergency` | Stay away from it and keep others away. If anyone is in danger, call emergency services (112) now. HomeGenie will not show repair steps for this. | इससे दूर रहें और दूसरों को भी दूर रखें। अगर किसी को खतरा है, तो अभी आपातकालीन सेवाओं (112) को कॉल करें। HomeGenie इसके लिए मरम्मत के चरण नहीं दिखाएगा। |
| `blocked.toolsLocked` | Tools and repair steps are not available for this problem. | इस समस्या के लिए औज़ार और मरम्मत के चरण उपलब्ध नहीं हैं। |
| `blocked.analysisDetails` | Details from the analysis | विश्लेषण से मिला विवरण |
| `blocked.callEmergency` | Call emergency services (112) | आपातकालीन सेवाओं (112) को कॉल करें |
| `blocked.findHelp` | Find nearby help | पास में मदद खोजें |
| `blocked.scanElse` | Scan something else | कुछ और स्कैन करें |
| `blocked.backHome` | Back to home | होम पर वापस जाएँ |
| `blocked.gateChecking` | Checking safety… | सुरक्षा जाँची जा रही है… |
| `followUp.title` | A few quick questions | कुछ छोटे सवाल |
| `followUp.intro` | Your answers can change the safety advice. Answer as best you can. | आपके जवाब सुरक्षा सलाह बदल सकते हैं। जितना हो सके सही जवाब दें। |
| `followUp.yes` | Yes | हाँ |
| `followUp.no` | No | नहीं |
| `followUp.required` | Required | ज़रूरी |
| `followUp.optional` | Optional | वैकल्पिक |
| `followUp.placeholderText` | Type your answer | अपना जवाब लिखें |
| `followUp.errorRequired` | Please answer this question. | कृपया इस सवाल का जवाब दें। |
| `followUp.errorTooLong` | Please use 200 characters or fewer. | कृपया 200 या उससे कम अक्षर लिखें। |
| `followUp.errorInvalidChoice` | Please choose one of the options. | कृपया दिए गए विकल्पों में से कोई एक चुनें। |
| `followUp.submit` | Send answers | जवाब भेजें |
| `followUp.submitting` | Sending… | भेजा जा रहा है… |
| `followUp.retry` | Try again | फिर कोशिश करें |
| `followUp.notAvailable` | Follow-up questions aren't available yet. | फ़ॉलो-अप सवाल अभी उपलब्ध नहीं हैं। |
| `followUp.updated` | Your answers were received. The safety advice on this page has been updated. | आपके जवाब मिल गए। इस पेज की सुरक्षा सलाह अपडेट कर दी गई है। |
| `followUp.errorOffline` | You seem to be offline. Check your connection and try again. | लगता है आप ऑफ़लाइन हैं। अपना कनेक्शन जाँचें और फिर कोशिश करें। |
| `followUp.errorUnauthenticated` | Please log in again to send your answers. | अपने जवाब भेजने के लिए कृपया फिर से लॉग इन करें। |
| `followUp.errorInvalidInput` | Please check your answers and try again. | कृपया अपने जवाब जाँचें और फिर कोशिश करें। |
| `followUp.errorBusy` | The service is busy right now. Please try again in a few minutes. | सेवा अभी व्यस्त है। कृपया कुछ मिनट बाद फिर कोशिश करें। |
| `followUp.errorUnavailable` | We couldn't send your answers. Your answers are still here, so you can try again. | हम आपके जवाब नहीं भेज सके। आपके जवाब यहीं हैं, इसलिए आप फिर कोशिश कर सकते हैं। |
| `session.offlineTitle` | You are offline | आप ऑफ़लाइन हैं |
| `session.offlineBody` | Connect to the internet to open this repair. We will try again when you are back online. | यह मरम्मत खोलने के लिए इंटरनेट से जुड़ें। ऑनलाइन होते ही हम फिर से कोशिश करेंगे। |
| `session.errorTitle` | This repair could not be loaded | यह मरम्मत लोड नहीं हो सकी |
| `session.errorBody` | Something went wrong. Please try again. | कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें। |
