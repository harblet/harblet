export function useCopy() {
  const toast = useToast()

  // navigator.clipboard is missing on plain HTTP. A span is selected instead of a textarea because modals keep the focus.
  function copyWithoutClipboardApi(text: string) {
    const span = document.createElement('span')
    span.textContent = text
    span.style.cssText = 'position: fixed; opacity: 0'
    span.addEventListener('copy', (event) => {
      event.clipboardData!.setData('text/plain', text)
      event.preventDefault()
    })
    document.body.append(span)
    const selection = getSelection()!
    selection.selectAllChildren(span)
    const copied = document.execCommand('copy')
    selection.removeAllRanges()
    span.remove()
    return copied
  }

  async function copy(text: string, title = 'Copied') {
    const copied = navigator.clipboard
      ? await navigator.clipboard.writeText(text).then(() => true, () => false)
      : copyWithoutClipboardApi(text)
    toast.add(copied ? { title, color: 'success' } : { title: 'Copying failed. Copy it by hand.', color: 'error' })
  }

  return { copy }
}
