import { getDb } from '../_lib/db.js'
import { createForgetHandler } from '../_lib/collect.js'

export default createForgetHandler({ getDb })
