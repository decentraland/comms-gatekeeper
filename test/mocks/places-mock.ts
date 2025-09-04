import { IPlacesComponent, PlaceAttributes } from '../../src/types/places.type'

export const createPlacesMockedComponent = (
  overrides?: Partial<jest.Mocked<IPlacesComponent>>
): jest.Mocked<IPlacesComponent> => {
  return {
    getPlaceByParcel: jest.fn(),
    getPlaceByWorldName: jest.fn(),
    getPlaceStatusById: jest.fn(),
    ...overrides
  }
}

const basePlace: PlaceAttributes = {
  id: 'test-place-id',
  title: 'Test Place',
  description: 'Test Description',
  image: null,
  highlighted_image: null,
  owner: '0x1234567890123456789012345678901234567890',
  positions: ['-9,-9'],
  base_position: '-9,-9',
  contact_name: null,
  contact_email: null,
  likes: 0,
  dislikes: 0,
  favorites: 0,
  like_rate: null,
  like_score: null,
  highlighted: false,
  disabled: false,
  disabled_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  deployed_at: new Date(),
  categories: [],
  user_like: false,
  user_dislike: false,
  user_favorite: false,
  world: undefined,
  world_name: undefined
}

export const createMockedPlace = (overrides: Partial<PlaceAttributes> = {}): PlaceAttributes => ({
  ...basePlace,
  world: false,
  world_name: null,
  ...overrides
})

export const createMockedWorldPlace = (overrides: Partial<PlaceAttributes> = {}): PlaceAttributes => ({
  ...basePlace,
  world: true,
  world_name: 'test-world.dcl.eth',
  ...overrides
})
