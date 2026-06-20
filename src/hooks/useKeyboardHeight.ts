import { useState, useEffect } from 'react'

/**
 * Detects mobile virtual keyboard height using the Visual Viewport API.
 * Returns the keyboard height in pixels (0 when keyboard is hidden).
 *
 * On mobile browsers, when the virtual keyboard opens the visual viewport
 * shrinks but the layout viewport (window.innerHeight) may not change.
 * We compare the two to derive the keyboard's occupied height.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function onResize() {
      const vv = window.visualViewport
      if (!vv) return
      // The difference between the layout viewport and the visual viewport
      // gives us a reliable keyboard height estimate.
      const kbHeight = Math.max(0, window.innerHeight - vv.height)
      // Only treat as keyboard if > 100px (avoid false positives from
      // browser chrome or address bar toggling)
      setKeyboardHeight(kbHeight > 100 ? kbHeight : 0)
    }

    vv.addEventListener('resize', onResize)
    // Also listen to scroll on the visual viewport (iOS fires this)
    vv.addEventListener('scroll', onResize)

    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
    }
  }, [])

  return keyboardHeight
}
