<template>
  <div class="audio-player-ui" tabindex="0" v-on:click.prevent>
    <div class="player-title">{{ displayTitle }}</div>
    <div class="horiz">
      <div v-show="!smallSize" class="vert">
        <div class="playpause" @click="togglePlay" ref="playpause">
        </div>
      </div>
      <div class="vert wide">
        <div class="waveform">
          <div class="wv" ref="wv" v-for="(s, i) in filteredData" :key="srcPath+i"
            v-bind:class="{'played': i <= currentBar }"
            @mouseover="setWvTimestampTooltip(i)"
            @mousedown="barMouseDownHandler(i)"
            :style="{
              height: s * 50 + 'px'
            }">
          </div>
        </div>
        <div class="timeline">
          <span class="current-time" @mouseover="setCopyTimestampTooltip" @click="copyTimestampToClipboard" ref="currentTime">
            {{ displayedCurrentTime }}
          </span>
          <span class="duration">
            {{ displayedDuration }}
          </span>
        </div>
      </div>
    </div>
    <div v-show="smallSize" class="horiz" :style="{'margin': 'auto'}">
      <div class="playpause seconds" @click="setPlayheadSecs(currentTime-5)" ref="min5">
        -5s
      </div>
      <div class="playpause play-button" @click="togglePlay" ref="playpause1">
      </div>
      <div class="playpause seconds" @click="setPlayheadSecs(currentTime+5)" ref="add5">
        +5s
      </div>
    </div>
    <div class="comment-list">
      <AudioCommentVue v-for="cmt in commentsSorted" v-bind:class="{'active-comment': cmt == activeComment }"
        @move-playhead="setPlayheadSecs" @remove="removeComment"
        :cmt="cmt" :key="cmt.timeString"></AudioCommentVue>
    </div>
  </div>
</template>

<script lang="ts">
import { TFile, setIcon, setTooltip, MarkdownPostProcessorContext } from 'obsidian'
import { defineComponent, PropType } from 'vue';
import { AudioComment } from '../types'
import { secondsToString, secondsToNumber } from '../utils'

import AudioCommentVue from './AudioComment.vue';

export default defineComponent({
  name: 'App',
  components: {
    AudioCommentVue
  },
  props: {
    filepath: String,
    ctx: Object as PropType<MarkdownPostProcessorContext>,
    title: String,
    content: Object as PropType<HTMLElement>,
    mdElement: Object as PropType<HTMLElement>,
    audio: Object as PropType<HTMLAudioElement>
  },
  data() {
    return {
      toggle: false,
      items: [...Array(100).keys()],
      srcPath: '',

      filteredData: [] as number[],
      nSamples: 100,
      duration: 0,
      currentTime: 0,
      playing: false,
      button: undefined as HTMLSpanElement | undefined,
      button1: undefined as HTMLSpanElement | undefined,

      clickCount: 0,
      showInput: false,
      newComment: '',
      comments: [] as AudioComment[],
      activeComment: null as AudioComment | null,

      ro: ResizeObserver,
      smallSize: false,
    }
  },
  computed: {
    displayTitle() { return this.title; },
    displayedCurrentTime() { return secondsToString(Math.min(this.currentTime, this.duration)); },
    displayedDuration() { return secondsToString(this.duration); },
    currentBar() { return Math.floor(this.currentTime / this.duration * this.nSamples); },
    commentsSorted() { return this.comments.sort((x: AudioComment, y:AudioComment) => x.timeStart - y.timeStart); },
  },
  methods: {
    getSectionInfo() { return this.ctx.getSectionInfo(this.mdElement); },
    getParentWidth() { return this.mdElement.clientWidth },
    isCurrent() { return this.audio.src === this.srcPath; },
    onResize() { 
      this.smallSize = this.$el.clientWidth < 300;
    },
    async loadFile() {
      // read file from vault 
      const file = window.app.vault.getAbstractFileByPath(this.filepath) as TFile;

      // process audio file & set audio el source
      if (file && file instanceof TFile) {
        //check cached values
        if (!this.loadCache()) 
          this.processAudio(file.path);

        this.srcPath = window.app.vault.getResourcePath(file);
      }
    },
    saveCache() {
      localStorage[`${this.filepath}`] = JSON.stringify(this.filteredData);
      localStorage[`${this.filepath}_duration`] = this.duration;
    },
    loadCache(): boolean {
      let cachedData = localStorage[`${this.filepath}`];
      let cachedDuration = localStorage[`${this.filepath}_duration`];

      if (!cachedData) { return false; }
      
      this.filteredData = JSON.parse(cachedData);
      this.duration = Number.parseFloat(cachedDuration)
      return true;
    },  
    async processAudio(path: string) {
      const arrBuf = await window.app.vault.adapter.readBinary(path);
      const audioContext = new AudioContext();
      const tempArray = [] as number[];

      audioContext.decodeAudioData(arrBuf, (buf) => {
        let rawData = buf.getChannelData(0);
        this.duration = buf.duration;

        const blockSize = Math.floor(rawData.length / this.nSamples);
        for (let i = 0; i < this.nSamples; i++) {
          let blockStart = blockSize * i;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[blockStart + j]);
          }
          tempArray.push(sum / blockSize);
        }
        
        let maxval = Math.max(...tempArray);
        this.filteredData = tempArray.map(x => x / maxval);
        this.saveCache();
      })
    },
    showCommentInput() {
      this.showInput = true;
      setTimeout(() => {
        const input = this.$refs.commentInput as HTMLInputElement;
        input.focus();
      })
    },
    barMouseDownHandler(i: number) {
      this.clickCount += 1;
      setTimeout(() => {
        this.clickCount = 0;
      }, 200);

      if (this.clickCount >= 2) {
        this.showCommentInput();
      } else {
        let time = i / this.nSamples * this.duration;
        this.setPlayheadSecs(time);
        
      }
    },
    setPlayheadSecs(time: any) {
      this.currentTime = time;
      if (!this.isCurrent()) 
          this.togglePlay();

      if (this.isCurrent()) {
        this.audio.currentTime = time;
      }
    },
    togglePlay() {
      if (!this.isCurrent()) {
        this.audio.src = this.srcPath;
      }

      if (this.audio.paused) {
        this.globalPause();
        this.play();
      } else {
        this.pause();
      } 
    },
    play() {
      if (this.currentTime > 0) {
        this.audio.currentTime = this.currentTime;
      }
      this.audio.addEventListener('timeupdate', this.timeUpdateHandler);
      this.audio?.play();
      this.playing = true;
      this.setBtnIcon('pause');    
    },
    pause() {
      this.audio?.pause();
      this.playing = false;
      this.setBtnIcon('play');
    },
    globalPause() {
      const ev = new Event('allpause');
      document.dispatchEvent(ev);
    },
    timeUpdateHandler() {
      if (this.isCurrent()) {
        this.currentTime = this.audio?.currentTime;

        const currentComments = this.commentsSorted.filter((x: AudioComment) =>
          this.audio?.currentTime >= x.timeStart && this.audio?.currentTime <= x.timeEnd
        );
        if (currentComments.length >= 1) {
          this.activeComment = currentComments[currentComments.length - 1];
        } else {
          this.activeComment = null;
        }
      }

    },
    setBtnIcon(icon: string) { 
      setIcon(this.button, icon);
      setIcon(this.button1, icon); 
    },

    addComment() {
      if (this.newComment.length == 0)
        return;
      const sectionInfo = this.getSectionInfo();
      const lines = sectionInfo.text.split('\n') as string[];
      const timeStamp = secondsToString(this.currentTime);
      lines.splice(sectionInfo.lineEnd, 0, `${timeStamp} --- ${this.newComment}`);

      window.app.vault.adapter.write(this.ctx.sourcePath, lines.join('\n'))
    },
    removeComment(i: number) {
      const sectionInfo = this.getSectionInfo();
      const lines = sectionInfo.text.split('\n') as string[];
      lines.splice(sectionInfo.lineStart + 2 + i, 1);
      window.app.vault.adapter.write(this.ctx.sourcePath, lines.join('\n'))
    },
    getComments() : Array<AudioComment> {
      const cmtElems = Array.from(this.content?.children || []);

      // parse comments into timestamp/window and comment text
      const timeStampSeparator = ' --- '
      const cmts = cmtElems.map((x: HTMLElement, i) => {
        const cmtParts = x.innerText.split(timeStampSeparator);
        if (cmtParts.length == 2) {
          const timeString = cmtParts[0];
          const timeWindow = timeString.split('-');
          const timeStartStr = timeWindow[0];
          const timeStart = secondsToNumber(timeStartStr);
          let timeEndStr = timeStartStr;
          // by default, timestamps with only start time are assumed to last 1sec
          let timeEnd = secondsToNumber(timeEndStr) + 1;
          if (timeWindow.length == 2) {
            timeEndStr = timeWindow[1];
            timeEnd = secondsToNumber(timeEndStr);
          }
          if (!isNaN(timeStart) && !isNaN(timeEnd)) {
            const content = x.innerHTML.replace(timeString + timeStampSeparator, '');
            const cmt: AudioComment = {
              timeStart: timeStart,
              timeEnd: timeEnd,
              timeString: timeString,
              content: content,
              index: i
            }
            return cmt;
          }
        }
      });
      return cmts.filter(Boolean) as Array<AudioComment>;
    },

    setCopyTimestampTooltip() {
      const elem = this.$refs.currentTime;
      setTooltip(elem, "Copy timestamp", {'delay': 150});
    },
    setWvTimestampTooltip(i: number) {
      const elem = this.$refs.wv[i];
      const time = i / this.nSamples * this.duration;
      setTooltip(elem, secondsToString(time), {'delay': 150, 'placement': 'top'});
    }
  },

  created() { 
    this.loadFile();
  },
  mounted() {
    this.button = this.$refs.playpause as HTMLSpanElement;
    this.button1 = this.$refs.playpause1 as HTMLSpanElement;
    this.setBtnIcon('play');

    // add event listeners
    document.addEventListener('allpause', () => {  
      this.setBtnIcon('play'); 
    });
    document.addEventListener('allresume', () => {
      if (this.isCurrent())
        this.setBtnIcon('pause');
    })
    document.addEventListener('addcomment', () => {
      if (this.isCurrent()) 
        this.showCommentInput();
    })
    this.audio.addEventListener('ended', () => {
      if (this.audio.src === this.srcPath)
        this.setBtnIcon('play');
    });

    this.$el.addEventListener('resize', () => {
      console.log(this.$el.clientWidth);
    })

    // get current time
    if (this.audio.src === this.srcPath) {
      this.currentTime = this.audio.currentTime
      this.audio.addEventListener('timeupdate', this.timeUpdateHandler);
      this.setBtnIcon(this.audio.paused ? 'play' : 'pause');
    }

    // load comments
    setTimeout(() => { this.comments = this.getComments(); });


    this.ro = new ResizeObserver(this.onResize);
    this.ro.observe(this.$el);
  },
  beforeDestroy() {
    this.ro.unobserve(this.$el);
  }
})

</script>