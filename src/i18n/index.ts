import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import enEmoji from "./locales/en-emoji.json";

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        "en-emoji": { translation: enEmoji },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: {
        escapeValue: false,
    },
});

export function changeLanguage(lng: string) {
    i18n.changeLanguage(lng);
}

export default i18n;
