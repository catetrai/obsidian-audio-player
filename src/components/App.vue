<template>
  <div class="audio-player-ui" tabindex="0" v-on:click.prevent>
    <div class="player-title">{{ displayTitle }}</div>
    <div class="horiz">
      <div v-show="!smallSize" class="vert">
        <div class="playpause playpause-controls" @click="skipToBeginning" ref="skipBackButton"></div>
        <div class="playpause" @click="togglePlay" ref="playpause"></div>
        <div class="playpause playpause-controls" @click="toggleLooping" v-bind:class="{ 'looping': looping }" ref="loopButton">
        </div>
      </div>
      <div class="vert wide">
        <div class="waveform">
          <div class="wv" ref="wv" v-for="(s, i) in filteredData" :key="srcPath + i" v-bind:class="{
            'played': i <= currentBar,
            'commented': barsWithComments.includes(i),
            'highlighted': highlightedBars.includes(i)
          }" @mouseover="setWvTimestampTooltip(i); highlightCommentForBar(i);" @mouseout="unhighlightComment();"
              @mousedown="barMouseDownHandler(i);" :style="{ height: s * 50 + 'px' }">
            <div class="wv-shade" v-if="barsWithComments.includes(i)" v-for="cmt in commentsForBar(i)" v-bind:class="{
              'begin': hasBeginSeparator(cmt, i),
              'end': hasEndSeparator(cmt, i)
            }" :style="{
                position: 'relative',
                height: getBarHighlightHeight(s, cmt.rank, commentsForBar(i)) + 'px',
                'margin-top': getBarHighlightMarginTop(s, cmt.rank, cmt, commentsForBar(i)) + 'px',
              }"></div>
          </div>
        </div>
        <div class="moodbar" v-html="displayedMoodbar"></div>
        <div class="timeline">
          <span class="current-time" @mouseover="setCopyTimestampTooltip" @click="copyTimestampToClipboard"
            ref="currentTime">
            {{ displayedCurrentTime }}
          </span>
          <span class="duration">
            {{ displayedDuration }}
          </span>
        </div>
      </div>
    </div>
    <div class="comment-list">
      <AudioCommentVue ref="audiocomment" v-for="cmt in commentsSorted" v-bind:class="{
        'active-comment': cmt == activeComment,
        'current-comment': cmt == currentComment,
        'highlighted-comment': cmt == highlightedComment
      }" @move-playhead="setPlayheadSecs" @mouseover="highlightBars(barsForComment(cmt))"
        @mouseout="unhighlightBars()" :cmt="cmt" :key="cmt.timeString"></AudioCommentVue>
      <div class="comment" v-if="commentsSorted.length > 0" v-bind:class="{
        'current-comment': currentComment == null
      }">
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { TFile, setIcon, setTooltip, MarkdownPostProcessorContext } from 'obsidian'
import { defineComponent, PropType } from 'vue';
import { AudioComment } from '../types'
import { secondsToString, secondsToNumber, range, hasOverlap } from '../utils'

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
    moodbar: Object as PropType<HTMLElement>,
    mdElement: Object as PropType<HTMLElement>,
    audio: Object as PropType<HTMLAudioElement>
  },
  data() {
    return {
      items: [...Array(100).keys()],
      srcPath: '',

      filteredData: [] as number[],
      nSamples: 100,
      duration: 0,
      currentTime: 0,
      playing: false,
      looping: false,
      button: undefined as HTMLSpanElement | undefined,

      newComment: '',
      comments: [] as AudioComment[],
      activeComment: null as AudioComment | null,
      currentComment: null as AudioComment | null,
      highlightedComment: null as AudioComment | null,
      highlightedBars: [] as number[],

      ro: ResizeObserver,
      smallSize: false,
    }
  },
  computed: {
    displayTitle() { return this.title; },
    displayedCurrentTime() { return secondsToString(Math.min(this.currentTime, this.duration)); },
    displayedDuration() { return secondsToString(this.duration); },
    displayedMoodbar() { return this.moodbar?.outerHTML; },
    currentBar() { return this.barForTime(this.currentTime); },
    startBars() { return this.commentsSorted.map((c: AudioComment) => c.barEdges[0]) },
    endBars() { return this.commentsSorted.map((c: AudioComment) => c.barEdges[1]) },
    barsWithComments() { return this.comments.map((c: AudioComment) => range(...c.barEdges)).flat().unique(); },
    commentsSorted() { return this.comments.sort((x: AudioComment, y: AudioComment) => x.timeStart - y.timeStart); },
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
    barMouseDownHandler(i: number) {
      let time = i / this.nSamples * this.duration;
      this.setPlayheadSecs(time);
    },
    setPlayheadSecs(time: any) {
      this.currentTime = time;
      if (!this.isCurrent())
        this.togglePlay();

      if (this.isCurrent()) {
        this.audio.currentTime = time;
      }
    },
    toggleLooping() {
      this.looping = !this.looping;
      this.audio.loop = this.looping;
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
    skipToBeginning() {
      this.audio.currentTime = 0;
    },
    timeUpdateHandler() {
      if (this.isCurrent()) {
        this.currentTime = this.audio?.currentTime;

        // Calculate current comment (comment where the current time marker should be displayed)
        if (this.comments.length > 0) {
          const firstComment = this.commentsSorted[0];
          if (this.currentTime <= firstComment.timeStart) {
            this.currentComment = firstComment;
          } else if (this.currentTime > this.commentsSorted[this.comments.length - 1].timeStart) {
            this.currentComment = null;  // means it's the last pseudo-comment element
          } else {
            const pastComments = this.commentsSorted.filter((x: AudioComment) =>
              this.currentTime <= x.timeStart
            );
            this.currentComment = this.commentsSorted[pastComments[0].index];
          }
        }

        // Calculate active comment (currently playing segment)
        const currentComments = this.commentsSorted.filter((x: AudioComment) =>
          this.currentTime >= x.timeStart && this.currentTime <= x.timeEnd
        );
        if (currentComments.length > 0) {
          const activeComment = currentComments[currentComments.length - 1];
          if (activeComment != this.activeComment) {
            const commentEl = this.$refs.audiocomment[activeComment.index].$el;
            commentEl.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' });
          }
          this.activeComment = activeComment;
        } else {
          this.activeComment = null;
        }

        // Check if immediately previous comment should be looped
        const immediatelyPreviousComments = this.commentsSorted.filter((x: AudioComment) =>
          this.currentTime - x.timeEnd >= 0 && this.currentTime - x.timeEnd <= 0.5
        );
        if (immediatelyPreviousComments.length > 0) {
          if (immediatelyPreviousComments[0].looping) {
            this.setPlayheadSecs(immediatelyPreviousComments[0].timeStart);
          }
        }
      }
    },

    setBtnIcon(icon: string) { setIcon(this.button, icon); },

    getComments(): Array<AudioComment> {
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
          // by default, timestamps with only start time are assumed to last 1s
          let timeEnd = secondsToNumber(timeEndStr) + 1;
          if (timeWindow.length == 2) {
            timeEndStr = timeWindow[1];
            timeEnd = secondsToNumber(timeEndStr);
          }
          if (!isNaN(timeStart) && !isNaN(timeEnd)) {
            const content = x.innerHTML.replace(timeString + timeStampSeparator, '');
            const bars = [timeStart, timeEnd].map(t => this.barForTime(t)) as [number, number];
            const cmt: AudioComment = {
              timeStart: timeStart,
              timeEnd: timeEnd,
              timeString: timeString,
              content: content,
              index: 0, // calculated at the end when sorting
              barEdges: bars,
              rank: 0, // calculated at the end
              looping: false  // do not loop by default
            }
            return cmt;
          }
        }
      });

      // Calculate comment index and rank
      const allCmts = cmts.filter(Boolean) as Array<AudioComment>;
      // Calculate overlaps between comment time windows.
      // Each comment gets a 'rank', which is used to calculate the
      // height of the comment's highlight on each waveform bin.
      // Rank 0 comments do not have any temporally overlapping
      // previous comments, so their waveform highlight bars will be
      // positioned at the topmost height.
      allCmts.sort((x: AudioComment, y: AudioComment) =>
        x.timeStart - y.timeStart
      ).forEach((cmt: AudioComment, i: number) => {
        // First comment has rank 0, because it cannot overlap with
        // any preceding comment by definition
        if (i == 0) return;
        cmt.index = i;
        const overlaps = allCmts.slice(0, i)
          .filter(c => hasOverlap(c.barEdges, cmt.barEdges));
        if (overlaps.length > 0) {
          while (overlaps.filter(c => c.rank == cmt.rank).length != 0) {
            // Increase rank after each successive overlap with a
            // previous comment
            cmt.rank += 1;
          }
        }
      });
      return allCmts;
    },
    barForTime(t: number) { return Math.floor(t / this.duration * this.nSamples); },
    barsForComment(cmt: AudioComment) { return range(...cmt.barEdges); },
    commentsForBar(i: number) {
      const barTimeStart = i / this.nSamples * this.duration;
      const barTimeEnd = (i + 1) / this.nSamples * this.duration;
      return this.comments.filter((c: AudioComment) =>
        hasOverlap([c.timeStart, c.timeEnd], [barTimeStart, barTimeEnd])
      ).sort((x: AudioComment, y: AudioComment) => x.rank - y.rank);
    },
    commentForBar(i: number) {
      const cmts = this.commentsForBar(i).sort(
        (x: AudioComment, y: AudioComment) => x.timeStart - y.timeStart
      );
      return cmts.length >= 1 ? cmts[cmts.length - 1] : null;
    },
    highlightComment(cmt: AudioComment) {
      this.highlightedComment = cmt;
      const commentEl = this.$refs.audiocomment[cmt.index].$el;
      commentEl.scrollIntoView(
        { block: 'nearest', inline: 'start', behavior: 'smooth' }
      );
    },
    highlightCommentForBar(i: number) {
      const cmt = this.commentForBar(i);
      cmt ? this.highlightComment(cmt) : this.highlightedComment = null;
    },
    unhighlightComment() { this.highlightedComment = null; },

    highlightBars(ixs: number[]) { this.highlightedBars = ixs; },
    unhighlightBars() { this.highlightedBars = []; },

    getBarHighlightHeight(s: number, rank: number, cmts: Array<AudioComment>) {
      // A bunch of magic numbers to get reasonable-looking
      // px values for CSS 'height' property
      const maxRank = Math.max(...cmts.map(x => x.rank));
      const maxRankGlobal = Math.max(
        ...this.comments.map((x: AudioComment) => x.rank)
      );
      const val = (Math.max(...this.filteredData) - s)
      const scaling = 50;
      const rankScaling = 3;
      const padding = 7 + rankScaling * maxRankGlobal;
      if (rank < maxRank) {
        const nextRank = cmts.filter(x => x.rank > rank)[0].rank;
        return rankScaling * (nextRank - rank);
      }
      return val * scaling + padding - rankScaling * rank;
    },
    getBarHighlightMarginTop(
      s: number, rank: number, cmt: AudioComment, cmts: Array<AudioComment>
    ) {
      // Arcane incantation to calculate CSS 'margin-top' property
      const height = this.getBarHighlightHeight(s, rank, cmts);
      const allRanks = cmts.map(x => x.rank);
      if (
        rank == 0 && cmts.length == 1
        || rank > cmts.indexOf(cmt) && rank != Math.max(...allRanks)
      )
        return -height;
      if (rank == Math.min(...allRanks))
        return -this.getBarHighlightHeight(s, rank, cmts.slice(0, -rank));
      return 0;
    },

    hasBeginSeparator(cmt: AudioComment, i: number) {
      // Whether the first waveform bin of the comment's time window
      // should be visually separated (because of overlap with the
      // previous comment
      if (i == 0) return false;  // first bin/bar has no overlap
      const cmtsPrevBar = this.commentsForBar(i - 1);
      if (!cmtsPrevBar || cmtsPrevBar.length == 0) return false;
      const areBarsAdjacent = this.startBars.includes(i)
        && this.endBars.includes(i - 1)
        && ! cmtsPrevBar.includes(cmt);
      const maxRankPrevBar = Math.max(...cmtsPrevBar.map((x: AudioComment) => x.rank));
      const isOverlapBegin = cmt.rank > 0 && cmt.rank > maxRankPrevBar;
      return areBarsAdjacent || isOverlapBegin;
    },
    hasEndSeparator(cmt: AudioComment, i: number) {
      // Whether the last waveform bin of the comment's time window
      // should be visually separated (because of overlap with the
      // next comment)
      if (i > this.filteredData.length - 1) return false;
      const cmtsNextBar = this.commentsForBar(i + 1);
      if (!cmtsNextBar || cmtsNextBar.length == 0) return false;
      const isOverlapEnd = cmt.rank > 0
        && cmt.rank > cmtsNextBar[cmtsNextBar.length - 1].rank;
      return this.endBars.includes(i) && isOverlapEnd;
    },

    copyTimestampToClipboard() {
      navigator.clipboard.writeText(this.displayedCurrentTime);
    },
    setCopyTimestampTooltip() {
      const elem = this.$refs.currentTime;
      setTooltip(elem, "Copy timestamp", { 'delay': 150 });
    },
    setWvTimestampTooltip(i: number) {
      const elem = this.$refs.wv[i];
      const time = i / this.nSamples * this.duration;
      setTooltip(elem, secondsToString(time), {
        'delay': 150, 'placement': 'top'
      });
    }
  },

  created() {
    this.loadFile();
  },
  mounted() {
    this.button = this.$refs.playpause as HTMLSpanElement;
    this.setBtnIcon('play');
    setIcon(this.$refs.loopButton, 'repeat');
    setIcon(this.$refs.skipBackButton, 'skip-back');

    // Add event listeners
    document.addEventListener('allpause', () => {
      this.setBtnIcon('play');
    });
    document.addEventListener('allresume', () => {
      if (this.isCurrent())
        this.setBtnIcon('pause');
    })
    document.addEventListener('looptoggle', () => {
      if (this.isCurrent())
        this.toggleLooping();
    })
    this.audio.addEventListener('ended', () => {
      if (this.audio.src === this.srcPath)
        this.setBtnIcon('play');
    });

    this.$el.addEventListener('resize', () => {
      console.log(this.$el.clientWidth);
    })

    // Get current time
    if (this.audio.src === this.srcPath) {
      this.currentTime = this.audio.currentTime
      this.audio.addEventListener('timeupdate', this.timeUpdateHandler);
      this.setBtnIcon(this.audio.paused ? 'play' : 'pause');
    }

    // Load comments
    setTimeout(() => { this.comments = this.getComments(); });

    this.ro = new ResizeObserver(this.onResize);
    this.ro.observe(this.$el);
  },
  beforeUnmount() {
    this.audio.removeEventListener("timeupdate", this.timeUpdateHandler);
    this.audio.removeEventListener("ended", this.audioEndedListener);
    document.removeEventListener("allpause", this.allPauseListener);
    document.removeEventListener("allresume", this.allResumeListener);
  },
  beforeDestroy() {
    this.ro.unobserve(this.$el);
  }
})

</script>