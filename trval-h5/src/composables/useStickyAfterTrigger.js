import { ref, nextTick, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'

export function useStickyAfterTrigger() {
  const trigger = ref(null)
  const visible = ref(false)
  let settleTimer = null

  const update = () => {
    visible.value = Boolean(trigger.value && trigger.value.getBoundingClientRect().top < 0)
  }
  const sync = () => nextTick(update)
  const start = () => {
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    sync()
    clearTimeout(settleTimer)
    settleTimer = setTimeout(update, 320)
  }
  const stop = () => {
    clearTimeout(settleTimer)
    settleTimer = null
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    visible.value = false
  }

  onMounted(start)
  onActivated(start)
  onDeactivated(stop)
  onUnmounted(stop)

  return { trigger, visible, update }
}
