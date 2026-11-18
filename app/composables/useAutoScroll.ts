export function useAutoScroll(element: Readonly<Ref<HTMLElement | null | undefined>>) {
  const pinned = ref(true)

  function scrollToBottom() {
    element.value?.scrollTo({ top: element.value.scrollHeight })
  }

  watch(element, (target, _, onCleanup) => {
    if (!target) {
      return
    }
    const onScroll = () => {
      pinned.value = target.scrollHeight - target.scrollTop - target.clientHeight < 16
    }
    const observer = new MutationObserver(() => {
      if (pinned.value) {
        scrollToBottom()
      }
    })
    target.addEventListener('scroll', onScroll)
    observer.observe(target, { childList: true, subtree: true, characterData: true })
    pinned.value = true
    scrollToBottom()
    onCleanup(() => {
      target.removeEventListener('scroll', onScroll)
      observer.disconnect()
    })
  }, { immediate: true, flush: 'post' })

  return { pinned: readonly(pinned), scrollToBottom }
}
