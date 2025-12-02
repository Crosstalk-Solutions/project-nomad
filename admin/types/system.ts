import { Systeminformation } from "systeminformation"


export type SystemInformationResponse = {
    cpu: Systeminformation.CpuData
    mem: Systeminformation.MemData
    os: Systeminformation.OsData
    disk: Systeminformation.DiskLayoutData[]
    currentLoad: Systeminformation.CurrentLoadData
    fsSize: Systeminformation.FsSizeData[]
    uptime: Systeminformation.TimeData
}

// Type inferrence is not working properly with usePage and shared props, so we define this type manually
export type UsePageProps = {
    appVersion: string
}