# Stage 1: Maven build — compiles BioSim from source
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
RUN apt-get update && apt-get install -y maven git curl && rm -rf /var/lib/apt/lists/*
# Clone BioSim source from upstream (shallow clone for speed)
RUN git clone --depth 1 https://github.com/scottbell/biosim.git .
RUN mvn package -DskipTests -q

# Stage 2: JRE-only runtime — saves ~180MB vs full JDK
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
# Copy built artifacts from build stage
COPY --from=build /app/bin ./bin
COPY --from=build /app/lib ./lib
COPY --from=build /app/target ./target
COPY --from=build /app/configuration ./configuration
COPY --from=build /app/etc ./etc
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN chmod +x ./bin/*
EXPOSE 8009
CMD ["./bin/start-biosim-server"]
