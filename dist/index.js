(() => {
  // index.js
  function getToggleButton() {
    return document.getElementById("toggleVAD");
  }
  var hivemind_connection = new JarbasHiveMind();
  hivemind_connection.onHiveConnected = function() {
    window.alert("Connected to HiveMind!");
  };
  hivemind_connection.onMycroftSpeak = function(mycroft_message) {
    let utterance = mycroft_message.data.utterance;
    const speechList = document.getElementById("audio-list");
    const entry = document.createElement("p");
    entry.textContent = "HiveMind says: " + utterance;
    speechList.prepend(entry);
  };
  hivemind_connection.onHiveDisconnected = function() {
    window.alert("Hivemind connection lost...");
  };
  window.hivemind_connection = hivemind_connection;
  window.onConnect = () => {
    console.log("connectin to HM");
    let ip = document.getElementById("hmip").value;
    let port = document.getElementById("hmport").value;
    let key = document.getElementById("hmkey").value;
    let crypto_key = document.getElementById("hmcrypto").value;
    let user = "HivemindWebSpeechV0.1";
    hivemind_connection.connect(ip, port, user, key, crypto_key);
  };
  async function main() {
    try {
      const myvad = await vad.MicVAD.new({
        onSpeechStart: () => {
          console.log("Speech start");
        },
        onSpeechEnd: (arr) => {
          console.log("Speech end");
          const wavBuffer = vad.utils.encodeWAV(arr);
          const base64 = vad.utils.arrayBufferToBase64(wavBuffer);
          const url = `data:audio/wav;base64,${base64}`;
          const el = addAudio(url);
          const speechList = document.getElementById("audio-list");
          speechList.prepend(el);
          const entry = document.createElement("p");
          entry.textContent = "User says: pretend this is a STT transcription";
          speechList.prepend(entry);
        }
      });
      window.myvad = myvad;
      getToggleButton().classList.remove("is-loading");
      window.toggleVAD = () => {
        console.log("ran toggle vad");
        if (myvad.listening === false) {
          myvad.start();
          getToggleButton().textContent = "Stop VAD";
        } else {
          myvad.pause();
          getToggleButton().textContent = "Start VAD";
        }
      };
      window.toggleVAD();
      getToggleButton().disabled = false;
    } catch (e) {
      console.error("Failed:", e);
    }
    function addAudio(audioUrl) {
      const entry = document.createElement("li");
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = audioUrl;
      entry.appendChild(audio);
      return entry;
    }
  }
  main();
})();
//# sourceMappingURL=index.js.map
