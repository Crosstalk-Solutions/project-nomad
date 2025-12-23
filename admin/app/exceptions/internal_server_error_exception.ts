import { Exception } from '@adonisjs/core/exceptions'

export default class InternalServerErrorException extends Exception {
  static status = 500
  static code = 'E_INTERNAL_SERVER_ERROR'
}