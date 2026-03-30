import type { IHttpServerComponent } from '@well-known-components/interfaces'

type ModeratorMiddlewareContext = IHttpServerComponent.DefaultContext<object> & {
  verification?: { auth?: string }
  url: URL
}

type ModeratorMiddleware = (
  context: ModeratorMiddlewareContext,
  next: () => Promise<IHttpServerComponent.IResponse>
) => Promise<IHttpServerComponent.IResponse>

export type ModeratorAuthOptions = {
  moderatorRequired: boolean
}

export interface IModeratorComponent {
  moderatorAuthMiddleware(options: ModeratorAuthOptions): ModeratorMiddleware
}
