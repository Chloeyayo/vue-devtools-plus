import { installHook } from '@back/hook'

if (document instanceof HTMLDocument) {
  installHook(window)
}
