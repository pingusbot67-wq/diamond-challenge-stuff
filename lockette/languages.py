"""Languages Lockette can hear and speak.

To add a language: copy one block, then change
  label  - what the Settings menu shows
  stt    - Google speech recognition code (e.g. "ko-KR", "vi-VN", "fr-FR")
  tts    - Google voice code (e.g. "ko", "vi", "fr"; run `python -m gtts.lang` for the list)
  claude - how to tell Claude which language to answer in
  the phrases Lockette says on its own (keep {name} and {what} as they are)
"""

LANGUAGES = {
    "en": {
        "label": "English",
        "stt": "en-US",
        "tts": "en",
        "claude": "English",
        "greeting": "Hi {name}, I'm ready. Press my button whenever you want to talk.",
        "not_caught": "Sorry, I didn't catch that. Could you press my button and say it again?",
        "reminder": "{name}, it's time for {what}.",
        "test": "Hi {name}, this is Lockette. Can you hear me?",
        "no_key": "My Claude key isn't set up yet. Please ask your family to add it.",
        "bad_key": "My Claude key isn't working. Please ask your family to check it.",
        "busy": "I'm a little busy right now. Please try again in a minute.",
        "offline": "I can't reach the internet right now. Please check the Wi-Fi.",
        "error": "Something went wrong on my end. Please try again.",
        "refusal": "Sorry, I can't help with that one.",
        "again": "Sorry, could you say that again?",
    },
    "zh-CN": {
        "label": "中文 普通话（简体）",
        "stt": "zh-CN",
        "tts": "zh-CN",
        "claude": "Mandarin Chinese, written in simplified characters",
        "greeting": "{name}，你好！我准备好了。想聊天的时候就按一下我的按钮。",
        "not_caught": "不好意思，我没听清楚。请再按一下按钮，再说一遍好吗？",
        "reminder": "{name}，时间到了：{what}。",
        "test": "{name}，你好，我是Lockette。你听得到我吗？",
        "no_key": "我的Claude密钥还没有设置好，请让家人帮忙设置一下。",
        "bad_key": "我的Claude密钥用不了，请让家人帮忙检查一下。",
        "busy": "我现在有点忙，请过一分钟再试。",
        "offline": "我现在连不上网络，请检查一下Wi-Fi。",
        "error": "我这边出了点问题，请再试一次。",
        "refusal": "不好意思，这个我帮不了你。",
        "again": "不好意思，你能再说一遍吗？",
    },
    "zh-TW": {
        "label": "中文 國語（繁體）",
        "stt": "zh-TW",
        "tts": "zh-TW",
        "claude": "Mandarin Chinese as spoken in Taiwan, written in traditional characters",
        "greeting": "{name}，你好！我準備好了。想聊天的時候就按一下我的按鈕。",
        "not_caught": "不好意思，我沒聽清楚。請再按一下按鈕，再說一遍好嗎？",
        "reminder": "{name}，時間到了：{what}。",
        "test": "{name}，你好，我是Lockette。你聽得到我嗎？",
        "no_key": "我的Claude金鑰還沒有設定好，請家人幫忙設定一下。",
        "bad_key": "我的Claude金鑰無法使用，請家人幫忙檢查一下。",
        "busy": "我現在有點忙，請過一分鐘再試。",
        "offline": "我現在連不上網路，請檢查一下Wi-Fi。",
        "error": "我這邊出了點問題，請再試一次。",
        "refusal": "不好意思，這個我幫不上忙。",
        "again": "不好意思，可以再說一遍嗎？",
    },
    "yue": {
        "label": "粵語 Cantonese（繁體）",
        "stt": "yue-Hant-HK",
        "tts": "yue",
        "claude": "Cantonese, written in traditional characters the way Cantonese is spoken in Hong Kong",
        "greeting": "{name}，你好！我準備好喇。想傾偈嘅時候就撳一下我個掣。",
        "not_caught": "唔好意思，我聽唔清楚。可唔可以再撳一下個掣，再講多一次？",
        "reminder": "{name}，夠鐘喇：{what}。",
        "test": "{name}，你好，我係Lockette。你聽唔聽到我講嘢？",
        "no_key": "我嘅Claude金鑰未設定好，請屋企人幫手設定吓。",
        "bad_key": "我嘅Claude金鑰用唔到，請屋企人幫手檢查吓。",
        "busy": "我而家有啲忙，請等一分鐘再試。",
        "offline": "我而家上唔到網，請檢查吓Wi-Fi。",
        "error": "我呢邊出咗啲問題，請再試一次。",
        "refusal": "唔好意思，呢樣我幫唔到你。",
        "again": "唔好意思，可唔可以再講多一次？",
    },
    "es": {
        "label": "Español",
        "stt": "es-US",
        "tts": "es",
        "claude": "Spanish, using the respectful usted form",
        "greeting": "Hola, {name}. Ya estoy aquí. Presione mi botón cuando quiera hablar.",
        "not_caught": "Perdón, no le entendí. ¿Puede presionar mi botón y decirlo otra vez?",
        "reminder": "{name}, es hora de: {what}.",
        "test": "Hola, {name}. Soy Lockette. ¿Me escucha?",
        "no_key": "Mi clave de Claude todavía no está configurada. Pídale ayuda a su familia.",
        "bad_key": "Mi clave de Claude no funciona. Pídale a su familia que la revise.",
        "busy": "Hay mucha demanda en este momento. Intente de nuevo en un minuto.",
        "offline": "No puedo conectarme a internet. Por favor, revise el wifi.",
        "error": "Algo salió mal. Por favor, intente otra vez.",
        "refusal": "Lo siento, no puedo ayudarle con eso.",
        "again": "Perdón, ¿puede repetirlo?",
    },
}

DEFAULT = "en"


def get(code):
    return LANGUAGES.get(code, LANGUAGES[DEFAULT])
