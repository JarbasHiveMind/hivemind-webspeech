(() => {
  // index.js
  function getToggleButton() {
    return document.getElementById("toggleVAD");
  }
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
