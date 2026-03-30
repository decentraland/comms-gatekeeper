import type { IHttpServerComponent } from '@well-known-components/interfaces'

export interface IModeratorComponent {
  moderatorAuthMiddleware(
    context: IHttpServerComponent.DefaultContext<object> & {
      verification?: { auth?: string }
      url: URL
    },
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse>
}
