import { HandlerContextWithPath } from '../../types'

// handlers arguments only type what they need, to make unit testing easier
export async function pingHandler(context: Pick<HandlerContextWithPath<'metrics', '/ping'>, 'url' | 'components'>) {
  const { url } = context

  return {
    body: url.pathname
  }
}
