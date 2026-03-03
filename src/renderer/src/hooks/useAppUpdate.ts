import { useEffect, useState } from 'react'

interface AppUpdateState {
  updateAvailable: boolean
  updateDownloaded: boolean
  version: string | null
  installUpdate: () => Promise<void>
}

export function useAppUpdate(): AppUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    // Consulta o estado atual ao montar — cobre o caso em que os eventos
    // dispararam antes do renderer terminar de carregar
    window.api.getUpdateStatus().then((status) => {
      if (status.available) {
        setUpdateAvailable(true)
        setVersion(status.version)
      }
      if (status.downloaded) {
        setUpdateDownloaded(true)
      }
    })

    // Ouve eventos futuros (ex: update baixado depois que o renderer já carregou)
    window.api.onUpdateAvailable((payload) => {
      setUpdateAvailable(true)
      setVersion(payload.version)
    })

    window.api.onUpdateDownloaded((payload) => {
      setUpdateDownloaded(true)
      setVersion(payload.version)
    })
  }, [])

  const installUpdate = async () => {
    await window.api.installUpdate()
  }

  return { updateAvailable, updateDownloaded, version, installUpdate }
}
