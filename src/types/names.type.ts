import { IBaseComponent } from '@well-known-components/interfaces'

export type INamesComponent = IBaseComponent & {
  getNamesFromAddresses(addresses: string[]): Promise<Record<string, string>>
}
