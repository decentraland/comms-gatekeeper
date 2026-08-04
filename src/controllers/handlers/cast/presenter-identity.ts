const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
const STREAMER_IDENTITY_REGEX = /^stream:.+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_STREAMER_IDENTITY_LENGTH = 512

export function isValidPresenterIdentity(identity: string): boolean {
  return (
    ETH_ADDRESS_REGEX.test(identity) ||
    (identity.length <= MAX_STREAMER_IDENTITY_LENGTH && STREAMER_IDENTITY_REGEX.test(identity))
  )
}
