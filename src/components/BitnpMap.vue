<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const MODEL_URL = '/model/LiangxiangMap.glb'

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let resizeObserver: ResizeObserver | null = null
let animationId = 0

function resize() {
  const container = containerRef.value
  if (!container || !renderer || !camera) return

  const width = container.clientWidth
  const height = container.clientHeight
  if (width === 0 || height === 0) return

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height, false)
}

function frameObject(object: THREE.Object3D) {
  if (!camera || !controls) return

  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  // Recenter the model on the origin so orbiting feels natural.
  object.position.sub(center)

  const maxDimension = Math.max(size.x, size.y, size.z) || 1
  const fov = (camera.fov * Math.PI) / 180
  const fitDistance = (maxDimension / 2 / Math.tan(fov / 2)) * 1.6

  camera.position.set(fitDistance * 0.9, fitDistance * 0.7, fitDistance * 0.9)
  camera.near = maxDimension / 100
  camera.far = maxDimension * 100
  camera.updateProjectionMatrix()

  controls.target.set(0, 0, 0)
  controls.minDistance = maxDimension * 0.05
  controls.maxDistance = fitDistance * 8
  controls.update()
}

function init() {
  const container = containerRef.value
  if (!container) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b1020)

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight || 1,
    0.1,
    10000,
  )
  camera.position.set(6, 6, 6)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = true

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x223344, 1.2)
  scene.add(hemisphere)

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
  keyLight.position.set(8, 14, 10)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.8)
  fillLight.position.set(-10, 6, -8)
  scene.add(fillLight)

  const loader = new GLTFLoader()
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene
      scene?.add(model)
      frameObject(model)
    },
    undefined,
    (error) => {
      console.error('[BitnpMap] 加载模型失败:', error)
    },
  )

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  window.addEventListener('resize', resize)

  const renderLoop = () => {
    animationId = requestAnimationFrame(renderLoop)
    controls?.update()
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
    }
  }
  renderLoop()
}

function dispose() {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resize)
  resizeObserver?.disconnect()
  resizeObserver = null
  controls?.dispose()
  controls = null

  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
    renderer = null
  }

  scene?.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose())
    } else if (material) {
      material.dispose()
    }
  })
  scene = null
  camera = null
}

onMounted(init)
onBeforeUnmount(dispose)
</script>

<template>
  <div ref="containerRef" class="bitnp-map"></div>
</template>

<style scoped>
.bitnp-map {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.bitnp-map :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
