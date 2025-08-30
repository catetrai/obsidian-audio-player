<template>
  <div class="comment">
    <span class="timestamp" @click="emitMovePlayhead">{{ cmt?.timeString }}</span>
    <span class="content" v-html="cmt?.content" @click="emitMovePlayhead"></span>
    <span class="loopcmt" ref="loopcmt"
      v-bind:class="{'looping': cmt?.looping}"
      @click="toggleLooping">
    </span>
  </div>

</template>

<script lang="ts">
import { setIcon } from 'obsidian';
import { AudioComment } from '../types';
import { defineComponent, PropType } from 'vue';
export default defineComponent({
  name: 'AudioComment',
  props: {
    cmt: Object as PropType<AudioComment>
  },
  methods: {
    emitMovePlayhead() {
      this.$emit('move-playhead', this.cmt?.timeStart);
    },
    toggleLooping() {
      this.cmt.looping = ! this.cmt.looping;
    }
  },
  mounted() {
    setIcon(this.$refs.loopcmt, 'repeat');
  }
})

</script>