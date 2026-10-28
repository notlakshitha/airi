import type { MetadataEventSource, WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { getMetadataSourceLabel } from '../../utils/event-source'
import { useConfiguratorByModsChannelServer } from '../configurator'
import { useModsServerChannelStore } from '../mods/api/channel-server'

const DISCORD_SERVICE_NAME = 'discord'

function isDiscordModuleIdentity(value: { name?: string, identity?: MetadataEventSource }) {
  return value.name === DISCORD_SERVICE_NAME || getMetadataSourceLabel(value.identity) === DISCORD_SERVICE_NAME
}

export const useDiscordStore = defineStore('discord', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const serverChannelStore = useModsServerChannelStore()

  const enabled = useLocalStorageManualReset<boolean>('settings/discord/enabled', false)
  const token = useLocalStorageManualReset<string>('settings/discord/token', '')

  const initialized = ref(false)
  const servicePresent = ref(false)
  const serviceHealthy = ref(false)

  let disposeRegistrySync: (() => void) | null = null
  let disposeRegistryHealthy: (() => void) | null = null
  let disposeRegistryUnhealthy: (() => void) | null = null
  let disposeModuleDeAnnounced: (() => void) | null = null

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    configurator.updateFor('discord', {
      token: token.value,
      enabled: enabled.value,
    })
  }

  const hasToken = computed(() => !!token.value.trim())

  // Green status must reflect a live Discord module connection, not merely a saved token (#2243).
  const configured = computed(() => servicePresent.value && serviceHealthy.value)

  function handleRegistrySync(event: WebSocketBaseEvent<'registry:modules:sync', WebSocketEvents['registry:modules:sync']>) {
    const moduleEntry = event.data.modules.find(isDiscordModuleIdentity)
    const wasPresent = servicePresent.value
    servicePresent.value = !!moduleEntry

    if (!moduleEntry) {
      serviceHealthy.value = false
      return
    }

    if (!wasPresent)
      serviceHealthy.value = true
  }

  function handleRegistryHealthy(event: WebSocketBaseEvent<'registry:modules:health:healthy', WebSocketEvents['registry:modules:health:healthy']>) {
    if (!isDiscordModuleIdentity(event.data))
      return

    servicePresent.value = true
    serviceHealthy.value = true
  }

  function handleRegistryUnhealthy(event: WebSocketBaseEvent<'registry:modules:health:unhealthy', WebSocketEvents['registry:modules:health:unhealthy']>) {
    if (!isDiscordModuleIdentity(event.data))
      return

    servicePresent.value = true
    serviceHealthy.value = false
  }

  function handleModuleDeAnnounced(event: WebSocketBaseEvent<'module:de-announced', WebSocketEvents['module:de-announced']>) {
    if (!isDiscordModuleIdentity(event.data))
      return

    servicePresent.value = false
    serviceHealthy.value = false
  }

  function initialize() {
    if (initialized.value)
      return

    initialized.value = true
    disposeRegistrySync = serverChannelStore.onEvent('registry:modules:sync', handleRegistrySync as any)
    disposeRegistryHealthy = serverChannelStore.onEvent('registry:modules:health:healthy', handleRegistryHealthy as any)
    disposeRegistryUnhealthy = serverChannelStore.onEvent('registry:modules:health:unhealthy', handleRegistryUnhealthy as any)
    disposeModuleDeAnnounced = serverChannelStore.onEvent('module:de-announced', handleModuleDeAnnounced as any)
  }

  function dispose() {
    disposeRegistrySync?.()
    disposeRegistryHealthy?.()
    disposeRegistryUnhealthy?.()
    disposeModuleDeAnnounced?.()
    disposeRegistrySync = null
    disposeRegistryHealthy = null
    disposeRegistryUnhealthy = null
    disposeModuleDeAnnounced = null
    initialized.value = false
  }

  function clearConnectionState() {
    servicePresent.value = false
    serviceHealthy.value = false
  }

  function resetState() {
    enabled.reset()
    token.reset()
    clearConnectionState()
    saveSettings()
  }

  return {
    enabled,
    token,
    hasToken,
    configured,
    servicePresent,
    serviceHealthy,
    saveSettings,
    initialize,
    dispose,
    resetState,
  }
})
