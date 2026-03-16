import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import type { IHttpServerComponent } from '@well-known-components/interfaces'

export interface IModeratorComponent {
  moderatorAuthMiddleware(
    context: IHttpServerComponent.DefaultContext<object> & DecentralandSignatureContext<any>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse>
}
