import os
import json
import numpy as np
import h5py
import tensorflow as tf
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import StandardScaler
import argparse

def load_json(file_path):
    """Load JSON RL dataset."""
    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)

def convert_json_to_numpy(data):
    """Convert RL JSON data into NumPy arrays."""
    states, actions, rewards = [], [], []
    
    for episode in data.get("episodes", []):
        for step in episode.get("states", []):
            states.append(step.get("observation", []))
            actions.append(step.get("action", 0))
            rewards.append(step.get("reward", 0))
    
    return np.array(states, dtype=np.float32), np.array(actions, dtype=np.int32), np.array(rewards, dtype=np.float32)

def normalize_data(states):
    """Normalize state representations."""
    if states.size == 0:
        return states
    scaler = StandardScaler()
    return scaler.fit_transform(states)

def save_as_hdf5(states, actions, rewards, output_path):
    """Save RL data to HDF5 format."""
    with h5py.File(output_path, "w") as f:
        f.create_dataset("states", data=states)
        f.create_dataset("actions", data=actions)
        f.create_dataset("rewards", data=rewards)

def save_as_tfrecord(states, actions, rewards, output_path):
    """Save RL data to TFRecord format."""
    with tf.io.TFRecordWriter(output_path) as writer:
        for s, a, r in zip(states, actions, rewards):
            example = tf.train.Example(features=tf.train.Features(feature={
                "state": tf.train.Feature(float_list=tf.train.FloatList(value=s.tolist())),
                "action": tf.train.Feature(int64_list=tf.train.Int64List(value=[int(a)])),
                "reward": tf.train.Feature(float_list=tf.train.FloatList(value=[float(r)]))
            }))
            writer.write(example.SerializeToString())

def save_as_csv(states, actions, rewards, output_path):
    """Save RL data to CSV format."""
    df = pd.DataFrame({"state": list(states), "action": actions, "reward": rewards})
    df.to_csv(output_path, index=False)

def process_rl_data(input_dir, output_dir, output_format):
    """Process RL data from directory and save in required format."""
    os.makedirs(output_dir, exist_ok=True)
    for file in Path(input_dir).rglob("*.json"):
        data = load_json(file)
        states, actions, rewards = convert_json_to_numpy(data)
        states = normalize_data(states)
        
        output_file = os.path.join(output_dir, f"{file.stem}.{output_format}")
        if output_format == "hdf5":
            save_as_hdf5(states, actions, rewards, output_file)
        elif output_format == "tfrecord":
            save_as_tfrecord(states, actions, rewards, output_file)
        elif output_format == "csv":
            save_as_csv(states, actions, rewards, output_file)
        elif output_format == "npy":
            np.savez(output_file, states=states, actions=actions, rewards=rewards)
        
        print(f"Processed {file} -> {output_file}")

def main():
    parser = argparse.ArgumentParser(description="Process RL datasets for NeuroGen AI training")
    parser.add_argument("--input_dir", default="C:\\Users\\Los\\Documents\\Documentation\\NeuroGen\\NeuroGen", help="Path to input directory containing RL datasets")
    parser.add_argument("--output_dir", default="C:\\Users\\Los\\Documents\\NeuroGen.Data", help="Path to save processed datasets")
    parser.add_argument("--format", choices=["hdf5", "tfrecord", "csv", "npy"], default="hdf5", help="Output format")
    args = parser.parse_args()
    
    process_rl_data(args.input_dir, args.output_dir, args.format)

if __name__ == "__main__":
    main()
