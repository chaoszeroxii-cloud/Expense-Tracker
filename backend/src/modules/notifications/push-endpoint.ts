import { BadRequestException } from '@nestjs/common'
import { lookup } from 'node:dns/promises'
import { Agent } from 'node:https'
import * as ipaddr from 'ipaddr.js'

/** Browser push services only. Never accept arbitrary HTTPS URLs from a subscriber. */
export function pushUrl(endpoint: string): URL {
  let url: URL
  try { url = new URL(endpoint) } catch { throw new BadRequestException('Invalid push endpoint') }
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
    || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    throw new BadRequestException('Unsupported push service')
  }
  return url
}

export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast' } catch { return false }
}

/** Resolve once, reject all private answers, and pin those answers to the TLS socket. */
export async function pushAgent(endpoint: string): Promise<Agent> {
  const url = pushUrl(endpoint)
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) {
    throw new BadRequestException('Push service must resolve to a public address')
  }
  return new Agent({
    keepAlive: false,
    lookup: (_hostname, options, callback) => {
      if (options.all) callback(null, addresses)
      else callback(null, addresses[0].address, addresses[0].family)
    },
  })
}
