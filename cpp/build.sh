cmake . -DUSE_BACKEND=CUDA -DBUILD_DISTRIBUTED=1 -DCMAKE_CUDA_ARCHITECTURES=native \
                      -DCUDNN_INCLUDE_DIR=$CONDA_PREFIX/include \
                      -DCUDNN_LIBRARY=$CONDA_PREFIX/lib/libcudnn.so.9
