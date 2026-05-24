import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

interface TavilySearchResult {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyResponse {
  results: TavilySearchResult[]
  answer?: string
}

@Injectable()
export class TavilyService {
  private readonly logger = new Logger(TavilyService.name)
  private readonly keys: string[]
  private readonly exhausted = new Map<string, number>() // key → exhausted timestamp
  private readonly RESET_AFTER_MS = 24 * 60 * 60 * 1000 // 24 hours

  constructor() {
    // Collect all TAVILY_KEY_* env vars in order
    this.keys = []
    let i = 1
    while (true) {
      const key = process.env[`TAVILY_KEY_${i}`]
      if (!key) break
      this.keys.push(key)
      i++
    }
    if (this.keys.length === 0) {
      this.logger.warn('No Tavily API keys configured (TAVILY_KEY_1, TAVILY_KEY_2, ...)')
    } else {
      this.logger.log(`Tavily: ${this.keys.length} key(s) loaded`)
    }
  }

  async search(query: string, maxResults = 5): Promise<TavilyResponse> {
    const key = this.getAvailableKey()
    if (!key) {
      return { results: [], answer: 'ไม่สามารถค้นหาได้ตอนนี้ — quota ครบทุก key แล้ว กรุณาเพิ่ม key ใหม่' }
    }

    try {
      const res = await axios.post(
        'https://api.tavily.com/search',
        { query, max_results: maxResults, include_answer: true, search_depth: 'advanced' },
        { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 },
      )
      return res.data as TavilyResponse
    } catch (err: any) {
      const status = err.response?.status
      if (status === 429 || status === 403) {
        this.logger.warn(`Tavily key ${this.maskKey(key)} exhausted (${status}), trying next`)
        this.markExhausted(key)
        return this.search(query, maxResults) // retry with next key
      }
      this.logger.error(`Tavily search error: ${err.message}`)
      return { results: [], answer: `ค้นหาล้มเหลว: ${err.message}` }
    }
  }

  getStatus() {
    this.pruneExpired()
    return {
      total: this.keys.length,
      available: this.keys.filter(k => !this.exhausted.has(k)).length,
      exhausted: this.keys.filter(k => this.exhausted.has(k)).length,
      keys: this.keys.map(k => ({
        key: this.maskKey(k),
        status: this.exhausted.has(k) ? 'exhausted' : 'available',
        resetsAt: this.exhausted.has(k)
          ? new Date(this.exhausted.get(k)! + this.RESET_AFTER_MS).toISOString()
          : null,
      })),
    }
  }

  private getAvailableKey(): string | null {
    this.pruneExpired()
    return this.keys.find(k => !this.exhausted.has(k)) ?? null
  }

  private markExhausted(key: string) {
    this.exhausted.set(key, Date.now())
  }

  private pruneExpired() {
    const now = Date.now()
    for (const [key, ts] of this.exhausted.entries()) {
      if (now - ts >= this.RESET_AFTER_MS) {
        this.exhausted.delete(key)
        this.logger.log(`Tavily key ${this.maskKey(key)} reset after 24h`)
      }
    }
  }

  private maskKey(key: string): string {
    return key.slice(0, 8) + '...' + key.slice(-4)
  }
}
