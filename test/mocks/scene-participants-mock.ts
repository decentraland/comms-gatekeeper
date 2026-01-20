import { ISceneParticipantsComponent } from '../../src/adapters/scene-participants'

export const createSceneParticipantsMockedComponent = (
  overrides?: Partial<ISceneParticipantsComponent>
): jest.Mocked<ISceneParticipantsComponent> => {
  return {
    getParticipantAddresses: jest.fn(),
    ...overrides
  } as jest.Mocked<ISceneParticipantsComponent>
}

