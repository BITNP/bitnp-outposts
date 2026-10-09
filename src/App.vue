<script setup lang="ts">
import { ref } from 'vue'
import BitnpMap from './components/BitnpMap.vue'
import type { BeaconConfig } from './types'
import logoUrl from './assets/BITNP-logo.png'

// 视频放在 public/ 下，会随 base 一起部署（注意 public 里的文件直接用根路径引用，不带 "public/"）
const officeVideoUrl = `${import.meta.env.BASE_URL}video/BITNP Office.mp4`

// 光柱配置：位置(x/z 为相对模型中心的水平偏移)、标注文字、点击回调
const beacons: BeaconConfig[] = [
  { id: 'office', label: '网协办公室', x: 300, z: 325 },
  { id: 'qiushi', label: '求是社区电脑诊所', x: 200, z: 460 },
  { id: 'library', label: '图书馆电脑诊所', x: 480, z: 280 },
]

const selected = ref<BeaconConfig | null>(null)

function onSelect(beacon: BeaconConfig) {
  selected.value = beacon
}

function onClose() {
  selected.value = null
}
</script>

<template>
  <div class="app">
    <BitnpMap :beacons="beacons" @beacon-select="onSelect" @beacon-close="onClose" />

    <Transition name="panel">
      <aside v-if="selected" class="panel">
        <div class="panel__glow" />
        <!-- <p class="panel__eyebrow">OUTPOST</p> -->
        <h1 class="panel__title">{{ selected.label }}</h1>
        <div class="panel__divider" />
        <!-- 每个点位独立编写介绍文本，用 v-if 区分 -->
        <template v-if="selected.id === 'office'">
          <p class="panel__body">
            坐标：北校区北食堂对面北理桥下靠近校门第一间
          </p>
          <p class="panel__body">
            描述：网协办公室/活动室
          </p>
          <video :src="officeVideoUrl" style="width: 80%" controls></video>
        </template>
        <template v-else-if="selected.id === 'qiushi'">
          <p class="panel__body">
            坐标：求是社区疏桐D地下室走到底右转
          </p>
          <p class="panel__body">
            描述：提供电脑义诊服务
          </p>
        </template>
        <template v-else-if="selected.id === 'library'">
          <p class="panel__body">
            坐标：徐特立图书馆3楼第二自然阅览室最里面311G
          </p>
          <p class="panel__body">
            描述：提供电脑义诊服务
          </p>
        </template>
        <template v-else>
          <p class="panel__body">{{ selected.label }} 的占位说明文字。</p>
        </template>
        <p class="panel__hint">点击地图区域任意位置返回</p>
      </aside>
    </Transition>

    <img :src="logoUrl" class="logo" alt="BITNP" />
  </div>
</template>

<style scoped>
.app {
  position: fixed;
  inset: 0;
}

.logo {
  position: fixed;
  right: 0;
  bottom: 0;
  width: 5vw;
  height: 5vw;
  aspect-ratio: 1 / 1;
  object-fit: contain;
  z-index: 20;
  pointer-events: none;
}

.panel {
  position: absolute;
  top: 50%;
  right: clamp(24px, 4vw, 72px);
  transform: translateY(-50%);
  width: 40vw;
  height: 50vh;
  padding: 28px 28px 32px;
  border-radius: 16px;
  border: 1px solid rgba(255, 210, 74, 0.35);
  background: rgba(12, 18, 34, 0.92);
  box-shadow:
    0 0 0 1px rgba(255, 210, 74, 0.08) inset,
    0 24px 60px rgba(0, 0, 0, 0.55),
    0 0 42px rgba(255, 210, 74, 0.14);
  color: #ffd24a;
  backdrop-filter: blur(10px);
  overflow-x: hidden;
  overflow-y: scroll;
  font-family: system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.panel__glow {
  position: absolute;
  top: -40%;
  left: -20%;
  width: 140%;
  height: 60%;
  background: radial-gradient(closest-side, rgba(255, 210, 74, 0.22), transparent);
  pointer-events: none;
}

.panel__eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.34em;
  color: rgba(255, 210, 74, 0.6);
}

.panel__title {
  margin: 0;
  font-size: 26px;
  letter-spacing: 0.06em;
  color: #ffe9a8;
  text-shadow: 0 0 18px rgba(255, 210, 74, 0.45);
}

.panel__divider {
  height: 1px;
  margin: 18px 0;
  background: rgba(255, 210, 74, 0.75);
}

.panel__body {
  margin: 0 10% 14px 10%;
  font-size: 14px;
  line-height: 1.7;
  text-align: left;
  color: rgba(226, 232, 240, 0.82);
}

.panel__hint {
  margin: 22px 0 0;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: rgba(255, 210, 74, 0.55);
}

.panel-enter-active,
.panel-leave-active {
  transition:
    opacity 0.32s ease,
    transform 0.32s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(28px);
}
</style>
