import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const channelMocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: any) => void>>()

  return {
    listeners,
    onEvent: vi.fn((type: string, callback: (event: any) => void) => {
      let callbacks = listeners.get(type)
      if (!callbacks) {
        callbacks = new Set()
        listeners.set(type, callbacks)
      }
      callbacks.add(callback)
      return () => {
        callbacks?.delete(callback)
      }
    }),
    emit(type: string, data: any) {
      for (const callback of listeners.get(type) ?? [])
        callback({ type, data })
    },
    reset() {
      listeners.clear()
    },
  }
})

vi.mock('../mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    onEvent: channelMocks.onEvent,
  }),
}))

vi.mock('../configurator', () => ({
  useConfiguratorByModsChannelServer: () => ({
    updateFor: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-shared/composables', async () => {
  const { ref } = await import('vue')

  return {
    useLocalStorageManualReset: (_key: string, initialValue: any) => {
      const value = ref(typeof initialValue === 'function' ? initialValue() : initialValue)
      return Object.assign(value, {
        reset: () => {
          value.value = typeof initialValue === 'function' ? initialValue() : initialValue
        },
      })
    },
  }
})

const { useDiscordStore } = await import('./discord')

describe('discord store connected status', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    channelMocks.reset()
    channelMocks.onEvent.mockClear()
  })

  it('issue #2243: stays unconfigured when only a token is saved', () => {
    const store = useDiscordStore()
    store.initialize()
    store.token = 'discord-bot-token'

    expect(store.hasToken).toBe(true)
    expect(store.configured).toBe(false)
  })

  it('issue #2243: lights configured only while the discord module is present and healthy', () => {
    const store = useDiscordStore()
    store.initialize()
    store.token = 'discord-bot-token'

    channelMocks.emit('registry:modules:sync', {
      modules: [{ name: 'discord' }],
    })
    expect(store.configured).toBe(true)

    channelMocks.emit('registry:modules:health:unhealthy', { name: 'discord' })
    expect(store.configured).toBe(false)

    channelMocks.emit('registry:modules:health:healthy', { name: 'discord' })
    expect(store.configured).toBe(true)

    channelMocks.emit('module:de-announced', { name: 'discord' })
    expect(store.configured).toBe(false)
  })

  it('ignores health events for other modules', () => {
    const store = useDiscordStore()
    store.initialize()

    channelMocks.emit('registry:modules:health:healthy', { name: 'minecraft-bot' })
    expect(store.configured).toBe(false)

    channelMocks.emit('registry:modules:sync', {
      modules: [{ name: 'twitter' }],
    })
    expect(store.configured).toBe(false)
  })
})
