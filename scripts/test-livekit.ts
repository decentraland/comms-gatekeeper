/**
 * LiveKit connection test script
 * Usage: npx ts-node scripts/test-livekit.ts
 */

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

const HOST = process.env.VITE_HOST ?? 'wss://livekit-1.decentraland.org'
const API_KEY = process.env.VITE_API_KEY ?? 'API-9BA8il'
const API_SECRET = process.env.VITE_API_SECRET ?? 'OlqztGnuzOOJKz58ITIjkPi9OVgMgB1X'
const ROOM_NAME = process.env.TEST_ROOM ?? 'test-room-' + Date.now()

function generateWalletAddress(): string {
  const hex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return '0x' + hex
}

async function generateToken(identity: string, roomName: string): Promise<string> {
  const token = new AccessToken(API_KEY, API_SECRET, {
    identity,
    ttl: 5 * 60 // 5 minutes
  })
  token.addGrant({
    roomJoin: true,
    room: roomName,
    roomList: false,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true
  })
  return token.toJwt()
}

async function testServerApi(httpHost: string): Promise<void> {
  console.log('\n--- Testing Server API (RoomServiceClient) ---')
  const roomClient = new RoomServiceClient(httpHost, API_KEY, API_SECRET)

  try {
    const rooms = await roomClient.listRooms()
    console.log(`✓ Server API reachable — ${rooms.length} active room(s)`)
    if (rooms.length > 0) {
      rooms.forEach((r) => {
        console.log(`  · ${r.name} | participants: ${r.numParticipants} | sid: ${r.sid}`)
      })
    }
  } catch (err: any) {
    console.error('✗ Server API error:', err.message ?? err)
  }
}

async function main() {
  const identity = generateWalletAddress()
  const httpHost = HOST.replace('wss://', 'https://').replace('ws://', 'http://')

  console.log('=== LiveKit Connection Test ===')
  console.log(`Host:     ${HOST}`)
  console.log(`API Key:  ${API_KEY}`)
  console.log(`Room:     ${ROOM_NAME}`)
  console.log(`Identity: ${identity}`)

  // 1. Generate token
  console.log('\n--- Generating Access Token ---')
  let jwt: string
  try {
    jwt = await generateToken(identity, ROOM_NAME)
    console.log('✓ Token generated (first 60 chars):', jwt.substring(0, 60) + '...')
  } catch (err: any) {
    console.error('✗ Token generation failed:', err.message ?? err)
    process.exit(1)
  }

  // 2. Test server API
  await testServerApi(httpHost)

  // 3. Print ready-to-use connection URL (same format as comms-gatekeeper)
  const connectionUrl = `livekit:${HOST}?access_token=${jwt}`
  console.log('\n--- Connection URL (client format) ---')
  console.log(connectionUrl)

  // 4. Print curl command to manually verify the token against the LiveKit API
  console.log('\n--- Manual verification (curl) ---')
  console.log(
    `curl -s -H "Authorization: Bearer ${jwt}" ${httpHost}/twirp/livekit.RoomService/ListRooms -d '{}'`
  )
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
