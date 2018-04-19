# Hades

Alpha 0.2.0 live tomographic explorer based on various tomographic models. The HADES server and client are provided. The database files containing the models are not included in this repository.

# Models

* UUP07
* MITP08
* SP12RTS-S
* SP12RTS-P

# Reading Models

Models must be put in the `./db` directory. Each model is a JSON object; the delta (δ) array is indexed by `longitude, latitude, depth` in that order. Grid values run from low to high. Please contact me if you need the prepared model files.

    {
      "longitudes": [-180...180],
      "latitudes": [-90...90],
      "depths": [0...2500],
      "model": "model-name",
      "delta": [δ0 ... δN]
    }
