import { getDb } from '../_lib/db.js'
import { createCollectHandler } from '../_lib/collect.js'

export default createCollectHandler({ getDb })
