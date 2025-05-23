# Copyright 2023-2025 Amazon.com, Inc. or its affiliates.

# Use NVIDIA's CUDA base image
FROM nvidia/cuda:11.6.2-cudnn8-devel-ubuntu18.04 AS build-env

# Set AWS to the maintainer
LABEL maintainer="Amazon Web Services"

# Enable sudo access for the build session
USER root

# Update and install core build dependencies
RUN apt-get update -y \
    && apt-get upgrade -y \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --fix-missing --no-install-recommends \
            software-properties-common build-essential ca-certificates \
            git make cmake wget unzip libtool automake \
            zlib1g-dev libsqlite3-dev pkg-config sqlite3 libcurl4-gnutls-dev \
            libtiff5-dev

# Install Miniconda
ARG MINICONDA_VERSION=Miniconda3-latest-Linux-x86_64
ARG MINICONDA_URL=https://repo.anaconda.com/miniconda/${MINICONDA_VERSION}.sh
ENV CONDA_TARGET_ENV=osml_model
RUN wget -c ${MINICONDA_URL} \
    && chmod +x ${MINICONDA_VERSION}.sh \
    && ./${MINICONDA_VERSION}.sh -b -f -p /opt/conda \
    && rm ${MINICONDA_VERSION}.sh \
    && ln -s /opt/conda/etc/profile.d/conda.sh /etc/profile.d/conda.sh

# Set our new conda target lib dirs
ENV PATH=$PATH:/opt/conda/bin
ENV LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/opt/conda/lib/
ENV PROJ_LIB=$PROJ_LIB:/opt/conda/share/proj

# Copy the conda environment file and create the environment
COPY conda/environment-py310.yml environment.yml
RUN conda env create -n ${CONDA_TARGET_ENV} --file environment.yml && \
    conda clean -afy && \
    find /opt/conda/ -follow -type f -name '*.a' -delete && \
    find /opt/conda/ -follow -type f -name '*.pyc' -delete && \
    find /opt/conda/ -follow -type f -name '*.js.map' -delete && \
    rm -rf /opt/conda/pkgs

# Activate the conda environment and install Python dependencies
RUN . /opt/conda/etc/profile.d/conda.sh && conda activate ${CONDA_TARGET_ENV} && \
    python3 -m pip install --no-cache-dir \
    "fvcore>=0.1.5,<0.1.6" \
    iopath==0.1.8 \
    pycocotools \
    omegaconf==2.1.1 \
    hydra-core==1.1.1 \
    black==21.4b2 \
    termcolor==1.1.0 \
    matplotlib==3.5.2 \
    yacs==0.1.8 \
    tabulate==0.8.9 \
    cloudpickle==2.0.0 \
    tqdm==4.62.3 \
    tensorboard==2.8.0 \
    opencv-contrib-python-headless==4.8.0.76 \
    setuptools==69.5.1

# Install Torch with GPU support
RUN . /opt/conda/etc/profile.d/conda.sh && conda activate ${CONDA_TARGET_ENV} && \
    python3 -m pip install --no-cache-dir \
    torch==1.12.0+cu116 \
    torchvision==0.13.0+cu116 \
    -f https://download.pytorch.org/whl/torch_stable.html

# Install Detectron2
ENV FORCE_CUDA="1"
ARG TORCH_CUDA_ARCH_LIST="Pascal;Volta;Turing"
ENV TORCH_CUDA_ARCH_LIST="${TORCH_CUDA_ARCH_LIST}"
RUN . /opt/conda/etc/profile.d/conda.sh && conda activate ${CONDA_TARGET_ENV} && \
    python3 -m pip install --no-cache-dir --no-deps 'git+https://github.com/facebookresearch/detectron2.git'

# Clean up unnecessary files
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    conda clean -afy && \
    python -m pip cache purge

# Stage 2: Build the final image
FROM nvidia/cuda:11.6.2-cudnn8-runtime-ubuntu18.04 AS osml_model

LABEL maintainer="Amazon Web Services"
USER root

# Copy only the necessary files from the build environment
COPY --from=build-env /opt/conda /opt/conda

# Set environment variables
ENV CONDA_TARGET_ENV="osml_model"
ENV PATH=$PATH:/opt/conda/bin
ENV LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/opt/conda/lib/
ENV PROJ_LIB=$PROJ_LIB:/opt/conda/share/proj
ENV PYTHONUNBUFFERED=1

# Set up the conda environment
SHELL ["/opt/conda/bin/conda", "run", "--no-capture-output", "-n", "osml_model", "/bin/bash", "-c"]
RUN echo 'conda activate "${CONDA_TARGET_ENV:-base}"' >> ~/.bashrc

# Copy model source and install it
RUN mkdir /home/osml-models
COPY . /home/osml-models

# Install the application dependencies
WORKDIR /home/osml-models
RUN chmod 777 --recursive .
RUN python3 -m pip install --no-cache-dir .

# Expose the necessary ports
EXPOSE 8080

# Disable health check
HEALTHCHECK NONE

# Set up a user to run the container
RUN adduser --system --no-create-home --group model
RUN chown -R model:model ./
USER model

# Set the entry point
ENTRYPOINT python3 src/aws/osml/models/$MODEL_SELECTION/app.py
