import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('room_cleanup_dispatches', {
    wallet: { type: 'text', notNull: true },
    epoch: { type: 'text', notNull: true },
    operation_id: { type: 'text', notNull: true },
    cluster_id: { type: 'text', notNull: true },
    revoke_before: { type: 'bigint', notNull: true, check: 'revoke_before > 0' },
    state: { type: 'text', notNull: true, check: "state IN ('dispatched', 'confirmed')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    confirmed_at: { type: 'timestamptz' }
  })
  pgm.addConstraint('room_cleanup_dispatches', 'room_cleanup_dispatches_pkey', {
    primaryKey: ['wallet', 'epoch', 'operation_id']
  })
  pgm.createIndex('room_cleanup_dispatches', 'wallet', { where: "state = 'dispatched'" })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('room_cleanup_dispatches')
}
