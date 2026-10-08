import { Lifecycle } from '@well-known-components/interfaces'
import { initComponents } from './components'
import { main } from './service'

Lifecycle.run({ main, initComponents })
