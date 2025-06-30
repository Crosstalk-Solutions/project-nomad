import Service from "#models/service";


export type ServiceSlim = Pick<Service, 'id' | 'service_name' | 'installed' | 'ui_location'>;