/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Stores the latest connection information of each player, captured whenever a LiveKit
  // token is requested. One row per player (keyed by address), upserted with the most
  // recent IP address (from the Cloudflare cf-connecting-ip header) and device id (from
  // the signed-fetch auth metadata deviceIdentifier). Both are nullable since older
  // clients may not send a device id and the IP header may be absent.
  pgm.createTable('player_connection_info', {
    address: { type: 'varchar(42)', notNull: true },
    // Max length covers IPv6 addresses.
    ip_address: { type: 'varchar(45)', notNull: false },
    device_id: { type: 'text', notNull: false },
    // Milliseconds since epoch.
    created_at: { type: 'bigint', notNull: true },
    // Milliseconds since epoch.
    updated_at: { type: 'bigint', notNull: true }
  })

  pgm.addConstraint('player_connection_info', 'pk_player_connection_info', {
    primaryKey: ['address']
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('player_connection_info', 'pk_player_connection_info')
  pgm.dropTable('player_connection_info')
}
