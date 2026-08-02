import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play, Pause, ChevronLeft, ChevronRight, Music, Volume2,
  CloudRain, TreePine, Waves, Flame, Bird, Wind, Moon, Mountain,
} from 'lucide-react'

interface Sound {
  id: string
  name: string
  icon: typeof CloudRain
  category: string
  freq: number
  type: OscillatorType
  description: string
}

const NATURE_PAGES: { title: string; subtitle: string; icon: typeof CloudRain }[] = [
  { title: 'Rain & Water', subtitle: 'Soothing precipitation rhythms', icon: CloudRain },
  { title: 'Forest & Birds', subtitle: 'Woodland soundscapes', icon: TreePine },
  { title: 'Ocean & Wind', subtitle: 'Coastal ambient textures', icon: Waves },
  { title: 'Night & Cosmos', subtitle: 'Twilight tranquility', icon: Moon },
]

const ALL_SOUNDS: Sound[] = [
  // Page 1: Rain & Water
  { id: 'gentle-rain', name: 'Gentle Rain', icon: CloudRain, category: 'Rain & Water', freq: 200, type: 'triangle', description: 'Soft, steady rainfall on leaves' },
  { id: 'thunderstorm', name: 'Distant Thunder', icon: CloudRain, category: 'Rain & Water', freq: 80, type: 'sawtooth', description: 'Low rumbles with rain pattering' },
  { id: 'waterfall', name: 'Forest Waterfall', icon: CloudRain, category: 'Rain & Water', freq: 350, type: 'triangle', description: 'Cascading water over rocks' },
  { id: 'stream', name: 'Mountain Stream', icon: CloudRain, category: 'Rain & Water', freq: 500, type: 'sine', description: 'Babbling brook through pebbles' },
  // Page 2: Forest & Birds
  { id: 'birds-dawn', name: 'Dawn Chorus', icon: Bird, category: 'Forest & Birds', freq: 900, type: 'sine', description: 'Birdsong at first light' },
  { id: 'forest-ambient', name: 'Deep Forest', icon: TreePine, category: 'Forest & Birds', freq: 250, type: 'triangle', description: 'Rustling leaves and quiet woods' },
  { id: 'crickets', name: 'Evening Crickets', icon: Bird, category: 'Forest & Birds', freq: 700, type: 'sawtooth', description: 'Warm summer night chorus' },
  { id: 'wind-pines', name: 'Wind Through Pines', icon: Wind, category: 'Forest & Birds', freq: 150, type: 'triangle', description: 'Breeze swaying through evergreens' },
  // Page 3: Ocean & Wind
  { id: 'ocean-waves', name: 'Ocean Waves', icon: Waves, category: 'Ocean & Wind', freq: 100, type: 'sine', description: 'Rhythmic tide on shoreline' },
  { id: 'seaside', name: 'Seaside Ambience', icon: Waves, category: 'Ocean & Wind', freq: 280, type: 'triangle', description: 'Waves, gulls, and salt breeze' },
  { id: 'desert-wind', name: 'Desert Wind', icon: Wind, category: 'Ocean & Wind', freq: 400, type: 'sawtooth', description: 'Warm gusts across sand dunes' },
  { id: 'coastal-storm', name: 'Coastal Storm', icon: Wind, category: 'Ocean & Wind', freq: 60, type: 'sawtooth', description: 'Powerful surf and howling wind' },
  // Page 4: Night & Cosmos
  { id: 'night-ambient', name: 'Starlit Night', icon: Moon, category: 'Night & Cosmos', freq: 180, type: 'sine', description: 'Deep, quiet celestial hum' },
  { id: 'campfire', name: 'Campfire Crackle', icon: Flame, category: 'Night & Cosmos', freq: 450, type: 'sawtooth', description: 'Warm fire under starry sky' },
  { id: 'tibetan-bowl', name: 'Tibetan Bowl', icon: Moon, category: 'Night & Cosmos', freq: 136, type: 'sine', description: 'Resonant meditative tones' },
  { id: 'aurora', name: 'Aurora Drift', icon: Moon, category: 'Night & Cosmos', freq: 220, type: 'triangle', description: 'Ethereal northern lights shimmer' },
]

export function SoundtrackTab() {
  const [activePage, setActivePage] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)
  const [volume, setVolume] = useState(40)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscRef = useRef<OscillatorNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)

  const pageSounds = ALL_SOUNDS.filter(s => s.category === NATURE_PAGES[activePage].title)

  const startSound = useCallback((sound: Sound) => {
    try {
      if (oscRef.current) {
        try { oscRef.current.stop() } catch {}
        oscRef.current.disconnect()
      }
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = sound.type
      osc.frequency.setValueAtTime(sound.freq, ctx.currentTime)
      // Add subtle LFO for movement
      if (sound.type === 'sawtooth') {
        osc.detune.setValueAtTime(2, ctx.currentTime)
        osc.detune.linearRampToValueAtTime(-2, ctx.currentTime + 3)
      }

      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime((volume / 100) * 0.2, ctx.currentTime + 0.5)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()

      oscRef.current = osc
      gainRef.current = gain
      setPlaying(sound.id)
    } catch {}
  }, [volume])

  const stopSound = useCallback(() => {
    if (gainRef.current && audioCtxRef.current) {
      gainRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 0.3)
    }
    setTimeout(() => {
      if (oscRef.current) {
        try { oscRef.current.stop() } catch {}
        oscRef.current = null
      }
      setPlaying(null)
    }, 400)
  }, [])

  const toggleSound = (sound: Sound) => {
    if (playing === sound.id) {
      stopSound()
    } else {
      startSound(sound)
    }
  }

  useEffect(() => {
    if (gainRef.current && audioCtxRef.current) {
      gainRef.current.gain.linearRampToValueAtTime(
        (volume / 100) * 0.2,
        audioCtxRef.current.currentTime + 0.2
      )
    }
  }, [volume])

  useEffect(() => () => stopSound(), [stopSound])

  const currentPage = NATURE_PAGES[activePage]
  const PageIcon = currentPage.icon

  return (
    <div className="flex flex-col h-full">
      {/* Page header with navigation */}
      <div className="shrink-0 p-4 border-b border-border/60">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setActivePage(p => (p - 1 + NATURE_PAGES.length) % NATURE_PAGES.length)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <PageIcon className="w-5 h-5 text-primary" />
            <div className="text-center">
              <h3 className="font-bold text-foreground text-sm">{currentPage.title}</h3>
              <p className="text-[10px] text-muted-foreground">{currentPage.subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => setActivePage(p => (p + 1) % NATURE_PAGES.length)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Page dots */}
        <div className="flex justify-center gap-1.5">
          {NATURE_PAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => setActivePage(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === activePage ? 'bg-primary w-4' : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Sound cards grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="wait">
            {pageSounds.map((sound, i) => {
              const isPlaying = playing === sound.id
              const Icon = sound.icon
              return (
                <motion.button
                  key={sound.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => toggleSound(sound)}
                  whileTap={{ scale: 0.97 }}
                  className={`relative p-4 rounded-2xl border text-left transition-all overflow-hidden group ${
                    isPlaying
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                      : 'border-border bg-white/60 hover:bg-white/90 hover:shadow-sm'
                  }`}
                >
                  {/* Animated wave bars when playing */}
                  {isPlaying && (
                    <div className="absolute bottom-3 right-3 flex items-end gap-0.5 h-3">
                      {[0, 1, 2, 0, 1].map((h, i) => (
                        <motion.div
                          key={i}
                          className="w-0.5 bg-primary/60 rounded-full"
                          animate={{ height: [3, 8 + h * 2, 3] }}
                          transition={{ duration: 0.6 + h * 0.15, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
                        />
                      ))}
                    </div>
                  )}

                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 transition-colors ${
                    isPlaying ? 'bg-primary/20' : 'bg-muted'
                  }`}>
                    {isPlaying ? (
                      <Pause className="w-4 h-4 text-primary" />
                    ) : (
                      <Play className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-foreground leading-tight">{sound.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{sound.description}</p>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Volume control */}
      <div className="shrink-0 p-4 border-t border-border/60">
        <div className="flex items-center gap-3">
          <Volume2 className={`w-4 h-4 ${playing ? 'text-primary' : 'text-muted-foreground'}`} />
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={e => setVolume(parseInt(e.target.value))}
            className="flex-1 h-1.5 accent-primary rounded-full appearance-none bg-muted cursor-pointer"
          />
          <span className="text-[10px] font-medium text-muted-foreground w-8 text-right">{volume}%</span>
        </div>
        {playing && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10px] text-primary mt-2 text-center flex items-center justify-center gap-1"
          >
            <Music className="w-3 h-3" />
            Now playing: {ALL_SOUNDS.find(s => s.id === playing)?.name}
          </motion.p>
        )}
      </div>
    </div>
  )
}
