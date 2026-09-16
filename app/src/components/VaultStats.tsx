import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPeopleGroup, faHandHoldingDollar, faChartLine } from '@fortawesome/free-solid-svg-icons'
import { useGuilds } from '../useGuilds'
import { useAllTimeVolume } from '../useAllTimeVolume'
import { formatUsdCompact } from '../format'
import { DEMO_MODE, MOCK_ALL_TIME_VOLUME } from '../mockData'

export function VaultStats() {
  const { guilds, loading: guildsLoading } = useGuilds()
  const allTimeVolume = useAllTimeVolume()

  const totalGuilds = guilds.length
  const totalFeesShared = guilds.reduce((sum, g) => sum + g.totalFeesEarnedUsd, 0)

  const volumeLoading = DEMO_MODE ? false : allTimeVolume.loading
  const totalVolume = DEMO_MODE ? MOCK_ALL_TIME_VOLUME : allTimeVolume.volumeUsd

  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 20, letterSpacing: '-0.01em' }}>
        Smart Swaps.
        <br />
        Where Every Trade Counts.
      </h1>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div
            className="text-secondary"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}
          >
            <FontAwesomeIcon icon={faPeopleGroup} />
            Crews
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--positive)' }}>
            {guildsLoading ? '…' : totalGuilds.toLocaleString('en-US')}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            className="text-secondary"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}
          >
            <FontAwesomeIcon icon={faHandHoldingDollar} />
            Fees Shared
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--positive)' }}>
            {guildsLoading ? '…' : formatUsdCompact(totalFeesShared)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            className="text-secondary"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}
          >
            <FontAwesomeIcon icon={faChartLine} />
            All-time Volume
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--positive)' }}>
            {volumeLoading ? '…' : formatUsdCompact(totalVolume)}
          </div>
        </div>
      </div>
    </div>
  )
}
