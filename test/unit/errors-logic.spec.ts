import { isErrorWithMessage } from '../../src/logic/errors'

describe('when checking if an object is an Error with a message property', () => {
  describe('when provided with an Error object', () => {
    let error: Error
    let result: boolean

    beforeEach(() => {
      error = new Error('test error')
      result = isErrorWithMessage(error)
    })

    it('should return true', () => {
      expect(result).toBe(true)
    })
  })

  describe('when provided with an object that has a message property', () => {
    let customError: { message: string }
    let result: boolean

    beforeEach(() => {
      customError = { message: 'custom error object' }
      result = isErrorWithMessage(customError)
    })

    it('should return true', () => {
      expect(result).toBe(true)
    })
  })

  describe('when provided with null', () => {
    let result: boolean

    beforeEach(() => {
      result = isErrorWithMessage(null)
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })

  describe('when provided with undefined', () => {
    let result: boolean

    beforeEach(() => {
      result = isErrorWithMessage(undefined)
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })

  describe('when provided with a non-object value', () => {
    let result: boolean

    beforeEach(() => {
      result = isErrorWithMessage('string error')
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })

  describe('when provided with an object without a message property', () => {
    let objectWithoutMessage: { code: string }
    let result: boolean

    beforeEach(() => {
      objectWithoutMessage = { code: 'ERROR_CODE' }
      result = isErrorWithMessage(objectWithoutMessage)
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })
})
