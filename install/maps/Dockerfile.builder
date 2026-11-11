FROM ghcr.io/valhalla/valhalla@sha256:aceb31f88f3d7d54fc9c152942a10f306e43eef37cc7da47365ef7999fec6cb1
USER root
WORKDIR /builder
RUN mkdir -p /tmp/nomad-timezones && cd /tmp/nomad-timezones && valhalla_build_timezones > /builder/timezones.sqlite
COPY map_regions_builder.py build_package.py /builder/
ENTRYPOINT ["python3", "/builder/map_regions_builder.py"]
