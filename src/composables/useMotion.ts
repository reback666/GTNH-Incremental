import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storageKey } from '../game/storage-key';

const KEY = storageKey('gtnh-incremental-motion');
const enabled = ref(true);
let loaded = false;

export function useMotion() {
  const reduced = ref(false);
  let query: MediaQueryList | null = null;
  const update = () => { reduced.value = query?.matches ?? false; };
  onMounted(() => {
    if (!loaded) {
      try { enabled.value = localStorage.getItem(KEY) !== 'off'; } catch { /* 私密窗口不影响游戏运行。 */ }
      loaded = true;
    }
    query = matchMedia('(prefers-reduced-motion: reduce)');
    update();
    query.addEventListener('change', update);
  });
  onUnmounted(() => query?.removeEventListener('change', update));
  function toggle(): void {
    enabled.value = !enabled.value;
    try { localStorage.setItem(KEY, enabled.value ? 'on' : 'off'); } catch { /* 只影响偏好持久化。 */ }
  }
  return { active: computed(() => enabled.value && !reduced.value), feedback: computed(() => !reduced.value), reduced, enabled, toggle };
}
