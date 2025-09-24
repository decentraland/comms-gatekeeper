import { IBaseComponent } from '@well-known-components/interfaces'
import { LambdasClient } from 'dcl-catalyst-client'

export interface ILambdasClientComponent extends IBaseComponent, Pick<LambdasClient, 'getAvatarDetails'> {}
