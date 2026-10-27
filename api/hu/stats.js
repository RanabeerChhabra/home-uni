import { getDb } from '../_lib/db.js'
import { createStatsHandler } from '../_lib/statsHandler.js'

export default createStatsHandler({ getDb })
