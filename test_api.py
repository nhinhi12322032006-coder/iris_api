import requests

url = "https://iris-api-5jf3.onrender.com/predict"

data = {
    "sepal_length": 5.1,
    "sepal_width": 3.5,
    "petal_length": 1.4,
    "petal_width": 0.2,
}

response = requests.post(url, json=data, timeout=30)
response.raise_for_status()

print(response.json())

result = response.json()
assert result['prediction'] in {'setosa', 'versicolor', 'virginica'}
assert 0 <= result['confidence'] <= 100
assert set(result['probabilities']) == {'setosa', 'versicolor', 'virginica'}
assert abs(sum(result['probabilities'].values()) - 100) < 0.05
assert result['confidence'] == result['probabilities'][result['prediction']]